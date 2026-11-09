import * as THREE from "three";
import { GameLayer } from "./GameLayer";
import { EntityContainer } from "./EntityContainer";
import { handleCollision } from "./handleCollision";
import { PlayerRenderer } from "./PlayerRenderer";
import type { InputHandler } from "./InputHandler";
import type { Entity } from "./Entity";
import { Player } from "./entities/Player";
import { Floor, FLOOR_AFTER } from "./entities/platforms/Floor";
import { Arrow } from "./entities/hazards/Arrow";
import type { Gate } from "./entities/Gate";
import { Addition } from "./entities/gates/Addition";
import { Multiplication } from "./entities/gates/Multiplication";
import { Cannon } from "./entities/Cannon";
import { MysteryBox } from "./entities/MysteryBox";
import { DEFAULT_CROWD_OPTIONS, FORCES, stepCrowd, type CrowdOptions, type ForceName } from "./crowdPhysics";
import type { LevelData } from "../data/Level";
import type { Skin } from "../data/skins";
import type { ResourceManager } from "../resources/ResourceManager";
import type { GameComponent } from "../DomHandler";

export const MAX_PLAYERS = 400;
/** Half width of a player, used to keep the crowd on the track. */
const PLAYER_HALF = 0.22;
/**
 * How far past the edge of the track the attraction point can go. Pointing
 * beyond the edge squeezes the crowd against it.
 */
const EDGE_OVERSHOOT = 2.5;
/**
 * Sideways slide of the whole crowd toward the pointer, on top of the
 * attraction: speed = gain * distance (1/s), capped. Moves everyone the same
 * way, so the crowd keeps its shape.
 */
const SLIDE_GAIN = 7;
const SLIDE_MAX_SPEED = 14;
/** Attraction used while walking to the cannon (constant: everyone walks). */
const GATHER_FORCE = () => 56;

/** Attraction function of the crowd. Can be changed with ?force=<name> in the URL. */
function pickForce(): ForceName {
	const name = new URLSearchParams(location.search).get("force");
	return name && name in FORCES ? name as ForceName : "mixed";
}

/**
 * - idle:   level displayed behind the main menu
 * - run:    the crowd runs toward the finish line
 * - cannon: players walk into the cannon and get shot at the "?" boxes
 * - won / lost
 */
export type GamePhase = "idle" | "run" | "cannon" | "won" | "lost";

export type GameCallbacks = {
	/** Coins earned right now (a box was hit). */
	onCoins(amount: number): void;
	onEnd(won: boolean): void;
};

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const projected = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const aimPlane = new THREE.Plane();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

export class Game extends GameLayer {
	readonly entities = new EntityContainer({
		onCreate: e => {
			const o = e.getObject();
			if (o) this.scene.add(o);
			e.onSummon(this);
		},
		onDelete: e => {
			const o = e.getObject();
			if (o) this.scene.remove(o);
			e.onDeath(this);
			e.dispose();
		},
	});

	phase: GamePhase = "idle";
	/** Seconds since the game was created. */
	time = 0;
	/** Current forward speed of the crowd. */
	speed = 0;

	readonly cannon: Cannon;
	/** Center of the "?" boxes loop. */
	readonly boxCenter: THREE.Vector3;
	/** Where the cannon aims (world). */
	readonly aimPoint = new THREE.Vector3();

	private readonly floor: Floor;
	private playerRenderer: PlayerRenderer;

	/** Players currently in the crowd (state "run"). */
	private crowd: Player[] = [];
	private crowdDirty = false;
	/** Point every player of the crowd is attracted to (moved by the finger). */
	private centerX = 0;
	private centerZ = 0;
	/** Average x of the crowd (followed by the camera). */
	private crowdX = 0;
	private readonly crowdOptions: CrowdOptions;
	private readonly gatherOptions: CrowdOptions;

	private combo = 0;
	private earned = 0;
	private endTimer = 0;
	private ui: GameComponent | null = null;

	constructor(
		renderer: THREE.WebGLRenderer,
		input: InputHandler,
		private readonly resources: ResourceManager,
		readonly level: LevelData,
		skin: Skin,
		private readonly callbacks: GameCallbacks,
	) {
		super(renderer, input);

		const room = level.width / 2 - PLAYER_HALF;
		const walls = { minX: -room, maxX: room };
		this.crowdOptions = { ...DEFAULT_CROWD_OPTIONS, ...walls, force: FORCES[pickForce()] };
		this.gatherOptions = { ...DEFAULT_CROWD_OPTIONS, ...walls, force: GATHER_FORCE, maxSpeed: 8 };

		this.playerRenderer = new PlayerRenderer(resources, skin, MAX_PLAYERS);
		this.scene.add(this.playerRenderer.group);

		this.floor = new Floor(level);
		this.entities.add("platform", this.floor);

		const model = (id: string) => resources.getModel(id).scene;

		for (const g of level.gates) {
			const Type = g.type === "mul" ? Multiplication : Addition;
			this.entities.add("gate", new Type(model("gate_post"), g.x, -g.z, g.width, g.value));
		}

		for (const a of level.arrows) {
			this.entities.add("hazard", new Arrow(
				model("arrow"), -a.z, a.speed, level.width / 2 + 2.5, a.height ?? 0.55, a.offset ?? 0,
			));
		}

		const c = level.cannon;
		this.cannon = new Cannon(model("cannon_base"), model("cannon_barrel"), -(level.length + FLOOR_AFTER - 6));
		this.entities.add("cannon", this.cannon);

		this.boxCenter = new THREE.Vector3(0, c.height, this.cannon.position.z - c.distance);
		this.aimPoint.copy(this.boxCenter);
		for (let i = 0; i < c.boxes; i++) {
			this.entities.add("box", new MysteryBox(
				model("mystery_box"), model("coin"), this.boxCenter, c.rx, c.ry, c.speed, i / c.boxes,
			));
		}

		this.setCrowdCount(level.start);
		// Let the crowd settle before it is displayed.
		for (let i = 0; i < 90; i++) this.stepCrowds(1 / 60);
		this.updateCamera(0, true);
	}

	/** Starts running. `ui` is the reactive game panel. */
	start(ui: GameComponent) {
		this.ui = ui;
		this.phase = "run";
		this.speed = this.level.speed;
		this.syncUi();
	}

	setSkin(skin: Skin) {
		this.scene.remove(this.playerRenderer.group);
		this.playerRenderer.dispose();
		this.playerRenderer = new PlayerRenderer(this.resources, skin, MAX_PLAYERS);
		this.scene.add(this.playerRenderer.group);
	}

	dispose() {
		this.entities.clear();
		this.scene.remove(this.playerRenderer.group);
		this.playerRenderer.dispose();
	}

	// ------------------------------------------------------------- crowd

	isSupported(x: number, z: number): boolean {
		for (const p of this.entities.get("platform"))
			if (p.isSupported(x, z)) return true;
		return false;
	}

	markCrowdDirty() {
		this.crowdDirty = true;
	}

	/** Spawns (in the middle of the crowd) or removes players (the outermost first). */
	private setCrowdCount(count: number) {
		count = Math.max(0, Math.min(MAX_PLAYERS, count));
		const diff = count - this.crowd.length;

		if (diff > 0) {
			// Small disk: the collisions then push them apart.
			const spread = Math.sqrt(diff) * 0.12;
			for (let i = 0; i < diff; i++) {
				const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
				const p = new Player(this.crowdX + Math.cos(a) * r, 0, this.centerZ + Math.sin(a) * r);
				this.crowd.push(p);
				this.entities.add("player", p);
			}
		} else if (diff < 0) {
			const dist = (p: Player) => (p.position.x - this.crowdX) ** 2 + (p.position.z - this.centerZ) ** 2;
			const outermost = [...this.crowd].sort((a, b) => dist(b) - dist(a)).slice(0, -diff);
			for (const p of outermost) p.die(0, 3, -this.speed);
		}
		this.crowdDirty = true;
		this.refreshCrowd();
	}

	private refreshCrowd() {
		if (!this.crowdDirty) return;
		this.crowdDirty = false;
		this.crowd = this.crowd.filter(p => p.isAlive() && p.state === "run");
	}

	passGate(gate: Gate) {
		// Gates on the same row are exclusive.
		for (const g of this.entities.get("gate"))
			if (g.position.z === gate.position.z) g.consume();
		this.refreshCrowd();
		this.setCrowdCount(gate.apply(this.crowd.length));
	}

	// ------------------------------------------------------------- cannon phase

	private startCannon() {
		this.phase = "cannon";
		this.speed = 0;
		for (const p of this.crowd) p.state = "gather";
		this.crowdDirty = false;
		this.crowd = [];
		this.combo = 0;
		this.input.reset();
	}

	spawnProjectile(from: THREE.Vector3, velocity: THREE.Vector3) {
		const p = new Player(0, 0, 0);
		p.shoot(from, velocity);
		this.entities.add("player", p);
	}

	onBoxHit(box: MysteryBox, player: Player) {
		player.kill();
		box.bump();
		this.combo++;
		this.earned += this.combo;
		this.callbacks.onCoins(this.combo);
		if (this.ui) {
			this.ui.combo = this.combo;
			this.ui.gain = this.combo;
			this.ui.gainKey++;
			this.ui.earned = this.earned;
		}
	}

	onMiss() {
		this.combo = 0;
		if (this.ui) this.ui.combo = 0;
	}

	private updateAim() {
		const { x, y } = this.input;
		if (x === null || y === null) {
			this.aimPoint.copy(this.boxCenter);
			return;
		}
		ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
		raycaster.setFromCamera(ndc, this.camera.get());
		aimPlane.set(new THREE.Vector3(0, 0, 1), -this.boxCenter.z);
		if (!raycaster.ray.intersectPlane(aimPlane, this.aimPoint)) this.aimPoint.copy(this.boxCenter);
		this.aimPoint.y = Math.max(0.5, this.aimPoint.y);
	}

	// ------------------------------------------------------------- loop

	protected gameFrame(dt: number) {
		this.time += dt;

		if (this.phase === "run") {
			this.followPointer();
			this.centerZ -= this.speed * dt;
			if (-this.centerZ >= this.level.length) this.startCannon();
		}
		this.stepCrowds(dt);

		if (this.phase === "cannon") this.updateAim();

		for (const e of this.entities.iterate()) e.frame(this, dt);
		this.detectCollisions();

		if (this.entities.removeDeads() > 0) this.crowdDirty = true;
		this.refreshCrowd();

		if (this.phase === "run" && this.crowd.length === 0) this.end(false);

		if (this.phase === "cannon") {
			const busy = this.cannon.ammo > 0 || this.entities.get("player").length > 0;
			this.endTimer = busy ? 0 : this.endTimer + dt;
			if (this.endTimer > 1) this.end(true);
		}
	}

	/**
	 * The crowd goes where the pointer is: the attraction point is the spot of
	 * the ground under the finger / mouse (only its x matters, the crowd keeps
	 * running forward). The walls keep the players on the track.
	 */
	private followPointer() {
		const { x, y } = this.input;
		if (x === null || y === null) return;
		ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
		raycaster.setFromCamera(ndc, this.camera.get());
		if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
		const limit = this.level.width / 2 - PLAYER_HALF + EDGE_OVERSHOOT;
		this.centerX = Math.max(-limit, Math.min(limit, hit.x));
	}

	/** Moves the crowd (attraction + collisions) and the players walking to the cannon. */
	private stepCrowds(dt: number) {
		if (this.crowd.length > 0) {
			// Slide sideways, but only until the crowd touches a wall (then the
			// attraction squeezes it, pushing harder would only make it shake).
			let left = Infinity, right = -Infinity;
			for (const p of this.crowd) {
				left = Math.min(left, p.position.x);
				right = Math.max(right, p.position.x);
			}
			const speed = Math.max(-SLIDE_MAX_SPEED, Math.min(SLIDE_MAX_SPEED, (this.centerX - this.crowdX) * SLIDE_GAIN));
			const slide = speed > 0
				? Math.min(speed * dt, Math.max(0, this.crowdOptions.maxX - right))
				: Math.max(speed * dt, Math.min(0, this.crowdOptions.minX - left));
			for (const p of this.crowd) {
				p.position.x += slide;
				p.position.z -= this.speed * dt;
			}
			stepCrowd(this.crowd, this.centerX, this.centerZ, dt, this.crowdOptions);
			let sum = 0;
			for (const p of this.crowd) sum += p.position.x;
			this.crowdX = sum / this.crowd.length;
		}

		if (this.phase === "cannon") {
			const walkers = this.entities.get("player").filter(p => p.state === "gather");
			const c = this.cannon.position;
			stepCrowd(walkers, c.x, c.z, dt, this.gatherOptions);
		}
	}

	private detectCollisions() {
		const others: Entity[] = [];
		for (const list of [this.entities.get("hazard"), this.entities.get("gate"), this.entities.get("box")])
			for (const e of list) {
				e.refreshHitbox();
				others.push(e);
			}

		for (const p of this.entities.get("player")) {
			if (p.state !== "run" && p.state !== "flying") continue;
			p.refreshHitbox();
			for (const o of others) {
				if (!p.isAlive()) break;
				if (p.hitbox.intersects(o.hitbox)) handleCollision(p, o, this);
			}
		}
	}

	private end(won: boolean) {
		this.phase = won ? "won" : "lost";
		this.speed = 0;
		this.callbacks.onEnd(won);
		this.syncUi();
	}

	protected gameUpdate(dt: number) {
		for (const e of this.entities.iterate()) e.update();
		this.playerRenderer.update(this.entities.get("player"), this.time);
		this.updateCamera(dt);
		this.syncUi();
	}

	private updateCamera(dt: number, snap = false) {
		if (this.phase === "cannon" || this.phase === "won") {
			const c = this.cannon.position;
			camPos.set(c.x, c.y + 4.2, c.z + 7.5);
			camLook.set(this.boxCenter.x, this.boxCenter.y * 0.75, this.boxCenter.z);
		} else {
			const zoom = Math.min(7, Math.sqrt(this.crowd.length) * 0.4);
			camPos.set(this.crowdX * 0.5, 6 + zoom, this.centerZ + 8 + zoom * 0.8);
			camLook.set(this.crowdX * 0.5, 0.5, this.centerZ - 5);
		}
		if (snap) this.camera.snap(camPos, camLook);
		else this.camera.follow(camPos, camLook, dt);
	}

	/** Pushes the displayed values to the reactive panel (only when changed). */
	private syncUi() {
		const ui = this.ui;
		if (!ui) return;

		if (ui.phase !== this.phase) ui.phase = this.phase;

		const count = this.phase === "cannon"
			? this.cannon.ammo + this.entities.get("player").filter(p => p.state === "gather").length
			: this.crowd.length;
		if (ui.count !== count) ui.count = count;

		const progress = Math.min(1, Math.round((-this.centerZ / this.level.length) * 100) / 100);
		if (ui.progress !== progress) ui.progress = progress;

		// Counter bubble above the crowd.
		const showBubble = this.phase === "run" && this.crowd.length > 0;
		if (ui.bubble.visible !== showBubble) ui.bubble.visible = showBubble;
		if (showBubble) {
			projected.set(this.crowdX, 1.6, this.centerZ).project(this.camera.get());
			const bx = Math.round((projected.x + 1) / 2 * window.innerWidth);
			const by = Math.round((1 - projected.y) / 2 * window.innerHeight);
			if (ui.bubble.x !== bx) ui.bubble.x = bx;
			if (ui.bubble.y !== by) ui.bubble.y = by;
		}

		// Crosshair of the cannon.
		const showAim = this.phase === "cannon";
		if (ui.aim.visible !== showAim) ui.aim.visible = showAim;
		if (showAim) {
			projected.copy(this.aimPoint).project(this.camera.get());
			const ax = Math.round((projected.x + 1) / 2 * window.innerWidth);
			const ay = Math.round((1 - projected.y) / 2 * window.innerHeight);
			if (ui.aim.x !== ax) ui.aim.x = ax;
			if (ui.aim.y !== ay) ui.aim.y = ay;
		}
	}
}
