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
import { Boss } from "./entities/enemies/Boss";
import { SpeedPad } from "./entities/SpeedPad";
import { Fan } from "./entities/props/Fan";
import { Recruit } from "./entities/Recruit";
import { CountLabel } from "./CountLabel";
import type { Gate } from "./entities/Gate";
import { Addition } from "./entities/gates/Addition";
import { Multiplication } from "./entities/gates/Multiplication";
import { Percentage } from "./entities/gates/Percentage";
import { SetCount } from "./entities/gates/SetCount";
import { Cannon } from "./entities/Cannon";
import { MysteryBox } from "./entities/MysteryBox";
import { boxPath, boxPathExtent } from "./boxPath";
import { DEFAULT_CROWD_OPTIONS, FORCES, stepCrowd, type CrowdOptions, type ForceName } from "./crowdPhysics";
import type { LevelData } from "../data/Level";
import { skinAbilities, type Skin, type SkinAbilities } from "../data/skins";
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
const SLIDE_GAIN = 8;
const SLIDE_MAX_SPEED = 16;
/** Attraction used while walking to the cannon (constant: everyone walks). */
const GATHER_FORCE = () => 56;

/** Enemies start charging when the crowd is this close. */
const ENEMY_TRIGGER = 8;
/** Distance between the centers of a player and an enemy that kills both. */
const ENEMY_CONTACT = 0.42;
const ENEMY_COLOR = "#e11d2a";
/** How fast the crowd stops for a fight / gets back to its speed (units/s²). */
const FIGHT_BRAKE = 25;
/** Default vertical speed given by a jump pad. */
const JUMP_POWER = 10;
/** How fast the crowd reaches the boosted speed, and slows down after (units/s²). */
const BOOST_ACCEL = 40;
const BOOST_DECEL = 10;
/** Distance between the centers of a player and a recruit that makes it join. */
const RECRUIT_CONTACT = 0.5;
const RECRUIT_COLOR = "#a3a3a3";
/** Out of the wind, the drift it caused fades at this rate (1/s). */
const WIND_RECOVER = 1.5;

type EnemyZone = {
	/** World z of the zone. */
	z: number;
	enemies: Enemy[];
	triggered: boolean;
	label: CountLabel;
};

type RecruitZone = {
	recruits: Recruit[];
	label: CountLabel;
	/** Recruits that joined the crowd (shown when the crowd leaves the zone). */
	joined: number;
	reported: boolean;
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

/** Puts the label above the middle of the group, showing how many are left. */
function updateGroupLabel(label: CountLabel, group: readonly { position: THREE.Vector3 }[]) {
	let sx = 0, sz = 0;
	for (const e of group) {
		sx += e.position.x;
		sz += e.position.z;
	}
	const n = group.length || 1;
	label.set(group.length, sx / n, 1.9, sz / n);
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
	/** Abilities of the equipped skin (jump, shields, speed, coins). */
	abilities: SkinAbilities;

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
	private readonly recruitRenderer: PlayerRenderer;
	private readonly recruitZones: RecruitZone[] = [];
	/** Speed boost: remaining time at full boost, and its factor. */
	private boostTime = 0;
	private boostFactor = 1;

	/** Players currently in the crowd (state "run"). */
	private crowd: Player[] = [];
	private crowdDirty = false;
	/** Point every player of the crowd is attracted to (moved by the finger). */
	private centerX = 0;
	/** Track x under the finger (centerX = pointerX + windDrift). */
	private pointerX = 0;
	/** How far the fans have blown the attraction point (back to 0 out of the wind). */
	private windDrift = 0;
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
		this.abilities = skinAbilities(skin.stats);

		const room = level.width / 2 - PLAYER_HALF;
		const walls = { minX: -room, maxX: room };
		this.crowdOptions = {
			...DEFAULT_CROWD_OPTIONS, ...walls, force: FORCES[pickForce()],
			maxSpeed: DEFAULT_CROWD_OPTIONS.maxSpeed * this.abilities.speed,
		};
		this.gatherOptions = { ...DEFAULT_CROWD_OPTIONS, ...walls, force: GATHER_FORCE, maxSpeed: 8 };
		this.enemyOptions = { ...DEFAULT_CROWD_OPTIONS, ...walls, force: FORCES.mixed, maxSpeed: 5.5 };

		this.playerRenderer = new PlayerRenderer(resources, skin, MAX_PLAYERS);
		this.scene.add(this.playerRenderer.group);
		this.enemyRenderer = new PlayerRenderer(resources, { color: ENEMY_COLOR, hat: null }, MAX_PLAYERS);
		this.scene.add(this.enemyRenderer.group);
		this.recruitRenderer = new PlayerRenderer(resources, { color: RECRUIT_COLOR, hat: null }, MAX_PLAYERS);
		this.scene.add(this.recruitRenderer.group);

		this.floor = new Floor(level);
		this.entities.add("platform", this.floor);

		const model = (id: string) => resources.getModel(id).scene;

		for (const g of level.gates) {
			const Type = { add: Addition, mul: Multiplication, pct: Percentage, set: SetCount }[g.type] ?? Addition;
			this.entities.add("gate", new Type(model("gate_post"), g.x, -g.z, g.width, g.value));
		}
		// Level design rule: a row with a red gate has no blue / green gate (purple is allowed).
		const rows = new Map<number, Gate[]>();
		for (const g of this.entities.get("gate")) rows.set(g.position.z, [...rows.get(g.position.z) ?? [], g]);
		for (const [z, row] of rows)
			if (row.some(g => !g.isGood()) && row.some(g => g.isGood() && !(g instanceof SetCount)))
				console.warn(`${level.name}: gate row z=${-z} mixes red and blue / green gates`);

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
			this.entities.add("prop", new Archer(model("player"), x, -a.z, a.interval ?? 0.7, a.offset ?? 0));
		}

		for (const g of level.enemies ?? []) this.spawnEnemyZone(g.x, -g.z, g.count);

		for (const b of level.bosses ?? [])
			this.entities.add("boss", new Boss(model("player"), b.x, -b.z, b.hp, b.interval ?? 1.5, b.reach ?? 1.2));

		for (const b of level.boosts ?? [])
			this.entities.add("boost", new SpeedPad(b.x, b.z, b.width, b.depth ?? 2, b.factor ?? 1.8, b.duration ?? 1.2));

		for (const w of level.winds ?? []) this.entities.add("prop", new Fan(w.z, w.depth, w.strength, level.width));

		for (const g of level.recruits ?? []) this.spawnRecruitZone(g.x, -g.z, g.count);

		const c = level.cannon;
		this.cannon = new Cannon(model("cannon_base"), model("cannon_barrel"), -(level.length + FLOOR_AFTER - 6));
		this.entities.add("cannon", this.cannon);
		// The players pile up behind the cannon, never beside or in front of it.
		this.gatherOptions.minZ = this.cannon.entry.z;

		this.boxCenter = new THREE.Vector3(0, c.height, this.cannon.position.z - c.distance);
		this.aimPoint.copy(this.boxCenter);
		for (let i = 0; i < c.boxes; i++) {
			this.entities.add("box", new MysteryBox(
				model("mystery_box"), model("coin"), boxPath(c, this.boxCenter, i),
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
		this.speed = this.runSpeed();
		this.syncUi();
	}

	/** Forward speed of the crowd, with the bonus of the skin. */
	private runSpeed() {
		return this.level.speed * this.abilities.speed;
	}

	setSkin(skin: Skin) {
		// Only changed in the menu (idle): the shields of the crowd are drawn again.
		this.abilities = skinAbilities(skin.stats);
		this.crowdOptions.maxSpeed = DEFAULT_CROWD_OPTIONS.maxSpeed * this.abilities.speed;
		for (const p of this.crowd) p.shield = Math.random() < this.abilities.shieldChance;
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
		this.scene.remove(this.recruitRenderer.group);
		this.recruitRenderer.dispose();
		for (const zone of [...this.enemyZones, ...this.recruitZones]) {
			this.scene.remove(zone.label.sprite);
			zone.label.dispose();
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

	/** Players of the running crowd. */
	crowdPlayers(): readonly Player[] {
		return this.crowd;
	}

	/** Speed strip touched: the crowd runs `factor` times faster for `duration` s. */
	boost(factor: number, duration: number) {
		this.boostFactor = this.boostTime > 0 ? Math.max(this.boostFactor, factor) : factor;
		this.boostTime = Math.max(this.boostTime, duration);
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
			p.hurt(dx * k, 6, dz * k);
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

		const label = new CountLabel("#e11d2a");
		this.scene.add(label.sprite);
		const zone: EnemyZone = { z, enemies, triggered: false, label };
		this.enemyZones.push(zone);
		this.updateEnemyLabel(zone);
	}

	private updateEnemyLabel(zone: EnemyZone) {
		const alive = zone.enemies.filter(e => e.isAlive() && e.state !== "dying" && e.state !== "fall");
		updateGroupLabel(zone.label, alive);
	}

	// ------------------------------------------------------------- recruits

	private spawnRecruitZone(x: number, z: number, count: number) {
		const room = this.level.width / 2 - PLAYER_HALF;
		const recruits: Recruit[] = [];
		const index = this.recruitZones.length;
		for (let i = 0; i < count; i++) {
			// Looser sunflower than the enemies: they stand apart, waiting.
			const r = Math.sqrt(i + 0.5) * 0.3;
			const a = i * 2.39996;
			const rec = new Recruit(Math.max(-room, Math.min(room, x + Math.cos(a) * r)), z + Math.sin(a) * r, index);
			recruits.push(rec);
			this.entities.add("recruit", rec);
		}
		const label = new CountLabel("#6b7280", "+");
		this.scene.add(label.sprite);
		const zone: RecruitZone = { recruits, label, joined: 0, reported: false };
		this.recruitZones.push(zone);
		updateGroupLabel(label, recruits);
	}

	/** Recruits touched by a player of the crowd join it. */
	private stepRecruits() {
		if (this.phase !== "run") return;
		const c2 = RECRUIT_CONTACT * RECRUIT_CONTACT;
		for (const zone of this.recruitZones) {
			if (zone.reported) continue;
			zone.recruits = zone.recruits.filter(r => r.isAlive());
			const near = zone.recruits.length > 0 && Math.abs(zone.recruits[0].position.z - this.centerZ) < 12;
			if (near) {
				for (const r of zone.recruits) {
					if (this.crowd.length >= MAX_PLAYERS) break;
					for (const p of this.crowd) {
						if (p.state !== "run" || p.position.y > 0.6) continue;
						const dx = p.position.x - r.position.x, dz = p.position.z - r.position.z;
						if (dx * dx + dz * dz > c2) continue;
						r.kill();
						const joined = new Player(r.position.x, 0, r.position.z);
						joined.shield = Math.random() < this.abilities.shieldChance;
						this.crowd.push(joined);
						this.entities.add("player", joined);
						zone.joined++;
						break;
					}
				}
			}
			// The crowd left the zone behind: show how many joined.
			const zoneZ = zone.label.sprite.position.z;
			if (zone.joined > 0 && (zone.recruits.every(r => !r.isAlive()) || zoneZ > this.centerZ + 3)) {
				zone.reported = true;
				if (this.ui) {
					this.ui.gateDelta = zone.joined;
					this.ui.gateKey++;
				}
			}
		}
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

		// While enemies charge (or a boss blocks the way), the crowd stops and
		// each player aims at the closest opponent.
		const fighters: { position: THREE.Vector3 }[] = this.phase === "run"
			? [...this.entities.get("enemy").filter(e => e.state === "run"), ...this.entities.get("boss").filter(b => b.isBlocking())]
			: [];
		const wasFighting = this.fighting;
		this.fighting = fighters.length > 0 && this.crowd.length > 0;
		for (const p of this.crowd) p.target = this.fighting ? nearest(p.position, fighters) : null;
		// Fight over: the crowd resumes from where it stands.
		if (wasFighting && !this.fighting) {
			this.centerX = this.crowdX;
			this.pointerX = this.crowdX - this.windDrift;
		}

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
				p.hurt(-dx * 4, 4, 2);
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
				p.shield = Math.random() < this.abilities.shieldChance;
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
		const before = this.crowd.length;
		const after = Math.max(0, Math.min(MAX_PLAYERS, gate.apply(before)));
		this.setCrowdCount(after);
		if (this.ui) {
			this.ui.gateDelta = after - before;
			this.ui.gateKey++;
		}
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

		const extent = boxPathExtent(this.level.cannon);
		const mx = extent.x + 3, my = extent.y + 3;
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
			if (!this.fighting) this.steer(dt);
			this.boostTime = Math.max(0, this.boostTime - dt);
			const boosted = this.boostTime > 0 ? this.boostFactor : 1;
			const wanted = this.fighting ? 0 : this.runSpeed() * boosted;
			// Fast to speed up on a boost, slower to come back to normal.
			const rate = this.fighting ? FIGHT_BRAKE : wanted > this.speed ? BOOST_ACCEL : BOOST_DECEL;
			this.speed += Math.max(-rate * dt, Math.min(rate * dt, wanted - this.speed));
			this.centerZ -= this.speed * dt;
			if (-this.centerZ >= this.level.length) this.startCannon();
		}
		this.stepCrowds(dt);
		this.stepEnemies(dt);
		this.stepRecruits();
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
	private steer(dt: number) {
		const { x, y } = this.input;
		if (x !== null && y !== null) {
			ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
			raycaster.setFromCamera(ndc, this.camera.get());
			if (raycaster.ray.intersectPlane(groundPlane, hit)) this.pointerX = hit.x;
		}

		// Fans blow the attraction point away: the finger has to follow against
		// the wind. Out of the wind, the crowd gently comes back under the finger.
		let wind = 0;
		for (const e of this.entities.get("prop")) if (e instanceof Fan) wind += e.pushAt(this.centerZ);
		if (wind !== 0) this.windDrift += wind * dt;
		else this.windDrift *= Math.exp(-WIND_RECOVER * dt);
		const w = this.level.width;
		this.windDrift = Math.max(-w, Math.min(w, this.windDrift));

		const limit = w / 2 - PLAYER_HALF + EDGE_OVERSHOOT;
		this.centerX = Math.max(-limit, Math.min(limit, this.pointerX + this.windDrift));
	}

	/** Moves the crowd (attraction + collisions) and the players walking to the cannon. */
	private stepCrowds(dt: number) {
		if (this.crowd.length > 0) {
			// Players on blinking spikes cannot move sideways.
			const blinking = this.entities.get("hazard").filter((h): h is Spikes => h instanceof Spikes && h.isBlinking());
			for (const p of this.crowd)
				p.lockX = blinking.some(s => s.covers(p.position.x, p.position.z));

			// Slide sideways, but only until the crowd touches a wall (then the
			// attraction squeezes it, pushing harder would only make it shake).
			let left = Infinity, right = -Infinity;
			for (const p of this.crowd) {
				if (p.lockX) continue;
				left = Math.min(left, p.position.x);
				right = Math.max(right, p.position.x);
			}
			const maxSlide = SLIDE_MAX_SPEED * this.abilities.speed;
			const speed = Math.max(-maxSlide, Math.min(maxSlide, (this.centerX - this.crowdX) * SLIDE_GAIN));
			const slide = speed > 0
				? Math.min(speed * dt, Math.max(0, this.crowdOptions.maxX - right))
				: Math.max(speed * dt, Math.min(0, this.crowdOptions.minX - left));
			for (const p of this.crowd) {
				if (!p.lockX) p.position.x += slide;
				p.position.z -= this.speed * dt;
			}
			stepCrowd(this.crowd, this.centerX, this.centerZ, dt, this.crowdOptions);
			for (const boss of this.entities.get("boss")) boss.pushOut(this.crowd);
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
			for (const p of walkers) p.lockX = false;
			const e = this.cannon.entry;
			stepCrowd(walkers, e.x, e.z, dt, this.gatherOptions);
		}
	}

	private detectCollisions() {
		const others: Entity[] = [];
		for (const list of [this.entities.get("pad"), this.entities.get("boost"), this.entities.get("hazard"), this.entities.get("gate"), this.entities.get("box")])
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
		// Coin multiplier of the skin: bonus on what the boxes gave.
		if (won && this.abilities.coins > 1) {
			const bonus = roundTenth(this.earned * (this.abilities.coins - 1));
			this.earned = roundTenth(this.earned + bonus);
			if (bonus > 0) this.callbacks.onCoins(bonus);
			if (this.ui) {
				this.ui.multiplier = this.abilities.coins;
				this.ui.earned = this.earned;
			}
		}
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
		this.recruitRenderer.update(this.entities.get("recruit"), this.time);
		for (const zone of this.enemyZones) this.updateEnemyLabel(zone);
		for (const zone of this.recruitZones) updateGroupLabel(zone.label, zone.recruits.filter(r => r.isAlive()));
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
