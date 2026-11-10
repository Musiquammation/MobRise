import * as THREE from "three";
import { GameLayer } from "./GameLayer";
import { EntityContainer } from "./EntityContainer";
import { handleCollision } from "./handleCollision";
import { PlayerRenderer } from "./PlayerRenderer";
import type { InputHandler } from "./InputHandler";
import type { Entity } from "./Entity";
import { Player } from "./entities/Player";
import { Floor, FLOOR_AFTER } from "./entities/platforms/Floor";
import { SpikeBall } from "./entities/hazards/SpikeBall";
import { Spikes } from "./entities/hazards/Spikes";
import { Saw } from "./entities/hazards/Saw";
import { JumpPad } from "./entities/JumpPad";
import { Archer } from "./entities/props/Archer";
import { Enemy } from "./entities/enemies/Enemy";
import type { Gate } from "./entities/Gate";
import { Addition } from "./entities/gates/Addition";
import { Multiplication } from "./entities/gates/Multiplication";
import { Percentage } from "./entities/gates/Percentage";
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

/** Enemies start charging when the crowd is this close. */
const ENEMY_TRIGGER = 13;
/** Distance between the centers of a player and an enemy that kills both. */
const ENEMY_CONTACT = 0.42;
const ENEMY_COLOR = "#e11d2a";
/** How fast the crowd stops for a fight / gets back to its speed (units/s²). */
const FIGHT_BRAKE = 25;
/** Default vertical speed given by a jump pad. */
const JUMP_POWER = 10;

type EnemyZone = {
	/** World z of the zone. */
	z: number;
	enemies: Enemy[];
	triggered: boolean;
	label: THREE.Sprite;
	shown: number;
};

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

const COMBO_K = 3;

/** Coins earned by the x-th box hit in a row: ln(3x+10) - ln(k+10) + 1, rounded to a tenth. */
export function comboGain(x: number) {
	return roundTenth(Math.log(3 * x + 10) - Math.log(COMBO_K + 10) + 1);
}

export function roundTenth(v: number) {
	return Math.round(v * 10) / 10;
}

/** Position of the entity of `list` closest to `from` (x / z), or null when empty. */
function nearest(from: THREE.Vector3, list: readonly { position: THREE.Vector3 }[]): THREE.Vector3 | null {
	let best: THREE.Vector3 | null = null, bestD = Infinity;
	for (const e of list) {
		const dx = e.position.x - from.x, dz = e.position.z - from.z;
		const d = dx * dx + dz * dz;
		if (d < bestD) {
			bestD = d;
			best = e.position;
		}
	}
	return best;
}

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
	/** Enemies are charging: the crowd stops and each player aims at an opponent. */
	fighting = false;

	readonly cannon: Cannon;
	/** Center of the "?" boxes loop. */
	readonly boxCenter: THREE.Vector3;
	/** Where the cannon aims (world). */
	readonly aimPoint = new THREE.Vector3();

	private readonly floor: Floor;
	private playerRenderer: PlayerRenderer;
	private readonly enemyRenderer: PlayerRenderer;
	private readonly enemyZones: EnemyZone[] = [];
	private readonly enemyOptions: CrowdOptions;

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

	/** Number of boxes hit in a row. */
	private combo = 0;
	/** Box hit by the last shot (the combo grows only on this one). */
	private comboBox: MysteryBox | null = null;
	/** Shown in orange (not cleared by a miss). */
	private lastHitBox: MysteryBox | null = null;
	/** Pointer screen position at the previous frame (relative aiming). */
	private aimPrev: THREE.Vector3 | null = null;
	private aimPress = -1;
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
		this.enemyOptions = { ...DEFAULT_CROWD_OPTIONS, ...walls, force: FORCES.mixed, maxSpeed: 5.5 };

		this.playerRenderer = new PlayerRenderer(resources, skin, MAX_PLAYERS);
		this.scene.add(this.playerRenderer.group);
		this.enemyRenderer = new PlayerRenderer(resources, { color: ENEMY_COLOR, hat: null }, MAX_PLAYERS);
		this.scene.add(this.enemyRenderer.group);

		this.floor = new Floor(level);
		this.entities.add("platform", this.floor);

		const model = (id: string) => resources.getModel(id).scene;

		for (const g of level.gates) {
			const Type = g.type === "mul" ? Multiplication : g.type === "pct" ? Percentage : Addition;
			this.entities.add("gate", new Type(model("gate_post"), g.x, -g.z, g.width, g.value));
		}

		for (const s of level.spikes) {
			this.entities.add("hazard", new SpikeBall(
				model("spike_ball"), -s.z, s.speed, level.width / 2 + 2.5, s.offset ?? 0,
			));
		}

		for (const s of level.spikeFields ?? [])
			this.entities.add("hazard", new Spikes(s.x, s.z, s.width, s.depth, s.period, s.offset));

		for (const s of level.saws ?? [])
			this.entities.add("hazard", new Saw(s.x, s.z, s.axis, s.length, s.speed, s.radius, s.offset));

		for (const j of level.jumps ?? [])
			this.entities.add("pad", new JumpPad(j.x, j.z, j.width, j.power ?? JUMP_POWER));

		for (const a of level.archers ?? []) {
			const x = a.side * (level.width / 2 + 1.6);
			this.entities.add("prop", new Archer(model("player"), x, -a.z, a.interval ?? 1.4, a.offset ?? 0));
		}

		for (const g of level.enemies ?? []) this.spawnEnemyZone(g.x, -g.z, g.count);

		const c = level.cannon;
		this.cannon = new Cannon(model("cannon_base"), model("cannon_barrel"), -(level.length + FLOOR_AFTER - 6));
		this.entities.add("cannon", this.cannon);
		// The players pile up behind the cannon, never beside or in front of it.
		this.gatherOptions.minZ = this.cannon.entry.z;

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
		this.scene.remove(this.enemyRenderer.group);
		this.enemyRenderer.dispose();
		for (const zone of this.enemyZones) {
			this.scene.remove(zone.label);
			zone.label.material.map?.dispose();
			zone.label.material.dispose();
		}
	}

	// ------------------------------------------------------------- queries used by entities

	/** Center of the running crowd (world x / z). */
	crowdCenter(): { x: number; z: number } {
		return { x: this.crowdX, z: this.centerZ };
	}

	crowdSize(): number {
		return this.crowd.length;
	}

	addProp(entity: Entity) {
		this.entities.add("prop", entity);
	}

	/** Kills the players of the crowd standing in the circle (x, z, radius). */
	hitArea(x: number, z: number, radius: number) {
		for (const p of this.crowd) {
			if (p.state !== "run" || p.position.y > 1) continue;
			const dx = p.position.x - x, dz = p.position.z - z;
			const d = Math.hypot(dx, dz);
			if (d > radius) continue;
			const k = 4 / Math.max(0.2, d);
			p.die(dx * k, 6, dz * k);
		}
		this.crowdDirty = true;
	}

	// ------------------------------------------------------------- enemies

	private spawnEnemyZone(x: number, z: number, count: number) {
		const room = this.level.width / 2 - PLAYER_HALF;
		const enemies: Enemy[] = [];
		const index = this.enemyZones.length;
		for (let i = 0; i < count; i++) {
			// Sunflower pattern: a packed disk.
			const r = Math.sqrt(i + 0.5) * 0.24;
			const a = i * 2.39996;
			const e = new Enemy(
				Math.max(-room, Math.min(room, x + Math.cos(a) * r)),
				z + Math.sin(a) * r,
				index,
			);
			enemies.push(e);
			this.entities.add("enemy", e);
		}

		const canvas = document.createElement("canvas");
		canvas.width = 128;
		canvas.height = 64;
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
		label.scale.set(1.6, 0.8, 1);
		label.renderOrder = 10;
		this.scene.add(label);

		const zone: EnemyZone = { z, enemies, triggered: false, label, shown: -1 };
		this.enemyZones.push(zone);
		this.updateEnemyLabel(zone);
	}

	private updateEnemyLabel(zone: EnemyZone) {
		const alive = zone.enemies.filter(e => e.isAlive() && e.state !== "dying" && e.state !== "fall");
		zone.label.visible = alive.length > 0;
		if (alive.length === 0) return;
		let sx = 0, sz = 0;
		for (const e of alive) {
			sx += e.position.x;
			sz += e.position.z;
		}
		zone.label.position.set(sx / alive.length, 1.9, sz / alive.length);
		if (zone.shown === alive.length) return;
		zone.shown = alive.length;
		const texture = zone.label.material.map as THREE.CanvasTexture;
		const ctx = (texture.image as HTMLCanvasElement).getContext("2d")!;
		ctx.clearRect(0, 0, 128, 64);
		ctx.fillStyle = "#e11d2a";
		ctx.beginPath();
		ctx.roundRect(14, 6, 100, 52, 18);
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.font = "bold 40px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(String(alive.length), 64, 34);
		texture.needsUpdate = true;
	}

	/** Wakes the enemy groups near the crowd, moves the charging ones, resolves the fights. */
	private stepEnemies(dt: number) {
		for (const zone of this.enemyZones) {
			zone.enemies = zone.enemies.filter(e => e.isAlive());
			if (zone.enemies.length === 0) continue;

			if (!zone.triggered && this.phase === "run" && zone.z - this.centerZ > -ENEMY_TRIGGER) {
				zone.triggered = true;
				for (const e of zone.enemies) if (e.state === "idle") e.state = "run";
			}
			if (!zone.triggered) continue;

			const runners = zone.enemies.filter(e => e.state === "run");
			if (this.phase === "run" && this.crowd.length > 0) {
				// Each enemy charges the closest player.
				for (const e of runners) e.target = nearest(e.position, this.crowd);
				stepCrowd(runners, this.crowdX, this.centerZ, dt, this.enemyOptions);
			} else {
				for (const e of runners) e.velocity.set(0, 0, 0);
			}
			// Left far behind the crowd: gone.
			for (const e of runners) if (e.position.z > this.centerZ + 10) e.kill();
		}

		// While enemies charge, the crowd stops and each player aims at the closest one.
		const fighters = this.phase === "run" ? this.entities.get("enemy").filter(e => e.state === "run") : [];
		const wasFighting = this.fighting;
		this.fighting = fighters.length > 0 && this.crowd.length > 0;
		for (const p of this.crowd) p.target = this.fighting ? nearest(p.position, fighters) : null;
		// Fight over: the crowd resumes from where it stands.
		if (wasFighting && !this.fighting) this.centerX = this.crowdX;

		// Fights: each enemy touching a player kills it and dies.
		if (this.phase !== "run") return;
		const c2 = ENEMY_CONTACT * ENEMY_CONTACT;
		for (const e of this.entities.get("enemy")) {
			if (e.state !== "run" && e.state !== "idle") continue;
			if (Math.abs(e.position.z - this.centerZ) > 12) continue;
			for (const p of this.crowd) {
				if (p.state !== "run" || p.position.y > 0.6) continue;
				const dx = p.position.x - e.position.x, dz = p.position.z - e.position.z;
				if (dx * dx + dz * dz > c2) continue;
				p.die(-dx * 4, 4, 2);
				e.die(dx * 4, 4, -3);
				this.crowdDirty = true;
				break;
			}
		}
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
		for (const p of this.crowd) {
			p.state = "gather";
			p.position.y = 0;
			p.velocity.y = 0;
			p.spin = 0;
		}
		this.crowdDirty = false;
		this.crowd = [];
		this.combo = 0;
		this.comboBox = null;
		this.aimPrev = null;
		this.aimPoint.copy(this.boxCenter);
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
		if (box !== this.lastHitBox) {
			this.lastHitBox?.setHighlighted(false);
			box.setHighlighted(true);
			this.lastHitBox = box;
		}
		// The combo only grows while the same box keeps being hit.
		this.combo = box === this.comboBox ? this.combo + 1 : 1;
		this.comboBox = box;
		const gain = comboGain(this.combo);
		this.earned = roundTenth(this.earned + gain);
		this.callbacks.onCoins(gain);
		if (this.ui) {
			this.ui.combo = this.combo;
			this.ui.gain = gain;
			this.ui.gainKey++;
			this.ui.earned = this.earned;
		}
	}

	onMiss() {
		this.combo = 0;
		this.comboBox = null;
		if (this.ui) this.ui.combo = 0;
	}

	/**
	 * Relative aiming: the target moves by the same amount as the pointer
	 * (measured on the plane of the boxes), it does not jump under it.
	 */
	private updateAim() {
		const { x, y, presses } = this.input;
		if (x === null || y === null) {
			this.aimPrev = null;
			return;
		}
		// A new touch starts from where the target already is.
		const prev = this.aimPrev;
		if (prev && presses === this.aimPress && (prev.x !== x || prev.y !== y)) {
			// Both points measured with the current camera: a moving camera does not drift the aim.
			aimPlane.set(new THREE.Vector3(0, 0, 1), -this.boxCenter.z);
			if (this.pointerOnPlane(prev.x, prev.y, aimPlane, projected) && this.pointerOnPlane(x, y, aimPlane, hit)) {
				this.aimPoint.x += hit.x - projected.x;
				this.aimPoint.y += hit.y - projected.y;
			}
		}
		this.aimPress = presses;
		(this.aimPrev ??= new THREE.Vector3()).set(x, y, 0);

		const c = this.level.cannon;
		const mx = c.rx + 3, my = c.ry + 3;
		this.aimPoint.x = Math.max(this.boxCenter.x - mx, Math.min(this.boxCenter.x + mx, this.aimPoint.x));
		this.aimPoint.y = Math.max(0.5, Math.min(this.boxCenter.y + my, this.aimPoint.y));
		this.aimPoint.z = this.boxCenter.z;
	}

	/** Point of `plane` under the screen position (x, y). */
	private pointerOnPlane(x: number, y: number, plane: THREE.Plane, out: THREE.Vector3): boolean {
		ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
		raycaster.setFromCamera(ndc, this.camera.get());
		return raycaster.ray.intersectPlane(plane, out) !== null;
	}

	// ------------------------------------------------------------- loop

	protected gameFrame(dt: number) {
		this.time += dt;

		if (this.phase === "run") {
			// Fighting: the crowd brakes and the pointer no longer steers it.
			if (!this.fighting) this.followPointer();
			const wanted = this.fighting ? 0 : this.level.speed;
			const step = FIGHT_BRAKE * dt;
			this.speed += Math.max(-step, Math.min(step, wanted - this.speed));
			this.centerZ -= this.speed * dt;
			if (-this.centerZ >= this.level.length) this.startCannon();
		}
		this.stepCrowds(dt);
		this.stepEnemies(dt);
		this.refreshCrowd();

		if (this.phase === "cannon") this.updateAim();

		for (const e of this.entities.iterate()) e.frame(this, dt);
		this.detectCollisions();

		if (this.entities.removeDeads() > 0) this.crowdDirty = true;
		this.refreshCrowd();

		if (this.phase === "run" && this.crowd.length === 0) this.end(false);

		if (this.phase === "cannon") {
			const busy = this.entities.get("player").length > 0;
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
			let sum = 0, sumZ = 0;
			for (const p of this.crowd) {
				sum += p.position.x;
				sumZ += p.position.z;
			}
			this.crowdX = sum / this.crowd.length;
			// Players charging their targets move the crowd: the center (camera,
			// triggers...) follows them so they are not pulled back afterward.
			if (this.fighting) {
				this.centerX = this.crowdX;
				this.centerZ = Math.min(this.centerZ, sumZ / this.crowd.length);
			}
		}

		if (this.phase === "cannon") {
			const walkers = this.entities.get("player").filter(p => p.state === "gather");
			const e = this.cannon.entry;
			stepCrowd(walkers, e.x, e.z, dt, this.gatherOptions);
		}
	}

	private detectCollisions() {
		const others: Entity[] = [];
		for (const list of [this.entities.get("pad"), this.entities.get("hazard"), this.entities.get("gate"), this.entities.get("box")])
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
		this.fighting = false;
		this.callbacks.onEnd(won);
		this.syncUi();
	}

	protected gameUpdate(dt: number) {
		for (const e of this.entities.iterate()) e.update();
		this.playerRenderer.update(this.entities.get("player"), this.time);
		this.enemyRenderer.update(this.entities.get("enemy"), this.time);
		for (const zone of this.enemyZones) this.updateEnemyLabel(zone);
		this.updateCamera(dt);
		this.syncUi();
	}

	private updateCamera(dt: number, snap = false) {
		if (this.phase === "cannon" || this.phase === "won") {
			const c = this.cannon.position;
			camPos.set(c.x, c.y + 5.6, c.z + 11);
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
			? this.entities.get("player").filter(p => p.state === "gather").length
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
