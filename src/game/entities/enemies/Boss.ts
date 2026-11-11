import * as THREE from "three";
import { Entity } from "../../Entity";
import type { Game } from "../../Game";
import type { Player } from "../Player";

/**
 * Giant swordsman blocking the track.
 * - idle:  waits for the crowd
 * - fight: the crowd stops and attacks it; it swings its sword every `interval`
 * - dying: falls on its back, then disappears
 */
export type BossState = "idle" | "fight" | "dying";

const SCALE = 3;
/** Collision radius: the players can't go through the boss. */
export const BOSS_RADIUS = 1.05;
/** Players closer than BOSS_RADIUS + this hit the boss. */
const CONTACT = 0.3;
/** Damage per second dealt by each player hitting the boss. */
const PLAYER_DPS = 1.5;
/** The fight starts when the crowd is this close. */
const TRIGGER = 8;
/** Time the sword is raised before a swing (warning). */
const WINDUP = 0.5;
/** Duration of the swing animation. */
const SWING_TIME = 0.18;
/** Angle covered by the swing, centered on the crowd. */
const ARC = (150 * Math.PI) / 180;
const DEATH_TIME = 1;
const BAR_W = 2.4;
/** Facing directions tried when looking for the most players to hit. */
const DIRECTIONS = 16;
/** Turn rate toward the chosen direction (1/s). */
const TURN_SPEED = 5;
/** Angles (yaw) of the players within reach, reused every frame. */
const near: number[] = [];

export class Boss extends Entity {
	state: BossState = "idle";
	hp: number;
	/** Players killed by the sword (stats / balancing). */
	kills = 0;
	private readonly object = new THREE.Group();
	private readonly body = new THREE.Group();
	private readonly swordPivot = new THREE.Group();
	private readonly warning: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
	private readonly bar: THREE.Sprite;
	private readonly barCanvas = document.createElement("canvas");
	private readonly barTexture: THREE.CanvasTexture;
	private readonly skins: THREE.MeshStandardMaterial[] = [];
	private readonly disposables: { dispose(): void }[] = [];
	private yaw = Math.PI; // faces the incoming crowd
	private timer = 0;
	/** The crowd reached the sword at least once (the swings have started). */
	private engaged = false;
	/** Time since the last swing (animation). */
	private sinceSwing = Infinity;
	private flash = 0;
	private deathTime = 0;
	private shownHp = -1;

	constructor(
		playerModel: THREE.Object3D,
		x: number,
		z: number,
		readonly maxHp: number,
		readonly interval: number,
		/** Reach of the sword beyond the body. */
		readonly reach: number,
	) {
		super();
		this.position.set(x, 0, z);
		this.hp = maxHp;

		// Dark red giant.
		const figure = playerModel.clone();
		figure.traverse(o => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh) return;
			const m = mesh.material as THREE.MeshStandardMaterial;
			if (m.name !== "skin") return;
			const skin = m.clone();
			skin.color.set("#7f1d1d");
			skin.emissive.set("#ffffff");
			skin.emissiveIntensity = 0;
			mesh.material = skin;
			this.skins.push(skin);
			this.disposables.push(skin);
		});
		figure.scale.setScalar(SCALE);
		this.body.add(figure);

		// Horned helmet.
		const hornGeo = new THREE.ConeGeometry(0.12, 0.55, 8).translate(0, 0.27, 0);
		const hornMat = new THREE.MeshStandardMaterial({ color: "#f5f0e1", roughness: 0.5 });
		this.disposables.push(hornGeo, hornMat);
		for (const side of [-1, 1]) {
			const horn = new THREE.Mesh(hornGeo, hornMat);
			horn.position.set(side * 0.55, SCALE * 0.95, 0);
			horn.rotation.z = -side * 0.6;
			this.body.add(horn);
		}

		// Sword held at the right shoulder, pointing forward (-z in local space).
		const reachTotal = BOSS_RADIUS + reach;
		const bladeLen = reachTotal - 0.5;
		const bladeGeo = new THREE.BoxGeometry(0.12, 0.3, bladeLen).translate(0, 0, -0.5 - bladeLen / 2);
		const bladeMat = new THREE.MeshStandardMaterial({ color: "#e5e7eb", metalness: 0.85, roughness: 0.2 });
		const guardGeo = new THREE.BoxGeometry(0.6, 0.12, 0.14).translate(0, 0, -0.45);
		const handleGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.45, 6).rotateX(Math.PI / 2).translate(0, 0, -0.2);
		const goldMat = new THREE.MeshStandardMaterial({ color: "#d4a017", metalness: 0.6, roughness: 0.35 });
		this.disposables.push(bladeGeo, bladeMat, guardGeo, handleGeo, goldMat);
		this.swordPivot.add(
			new THREE.Mesh(bladeGeo, bladeMat),
			new THREE.Mesh(guardGeo, goldMat),
			new THREE.Mesh(handleGeo, goldMat),
		);
		this.swordPivot.position.set(0, SCALE * 0.42, 0);
		this.body.add(this.swordPivot);
		this.object.add(this.body);

		// Red sector on the ground: where the sword will hit.
		const ringGeo = new THREE.RingGeometry(BOSS_RADIUS * 0.8, reachTotal, 24, 1, Math.PI / 2 - ARC / 2, ARC);
		ringGeo.rotateX(-Math.PI / 2);
		this.warning = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
			color: "#ef4444", transparent: true, opacity: 0, depthWrite: false,
		}));
		this.warning.position.y = 0.03;
		this.disposables.push(ringGeo, this.warning.material);
		this.object.add(this.warning);

		// Health bar.
		this.barCanvas.width = 256;
		this.barCanvas.height = 64;
		this.barTexture = new THREE.CanvasTexture(this.barCanvas);
		this.barTexture.colorSpace = THREE.SRGBColorSpace;
		const barMat = new THREE.SpriteMaterial({ map: this.barTexture, depthTest: false, transparent: true });
		this.bar = new THREE.Sprite(barMat);
		this.bar.scale.set(BAR_W, BAR_W / 4, 1);
		this.bar.position.y = SCALE * 1.2 + 0.3;
		this.bar.renderOrder = 10;
		this.disposables.push(this.barTexture, barMat);
		this.object.add(this.bar);
		this.drawBar();
	}

	getObject() {
		return this.object;
	}

	/** The crowd must stop and fight. */
	isBlocking(): boolean {
		return this.state === "fight";
	}

	frame(game: Game, dt: number) {
		this.flash = Math.max(0, this.flash - dt * 6);
		this.sinceSwing += dt;

		if (this.state === "dying") {
			this.deathTime += dt;
			if (this.deathTime >= DEATH_TIME) this.kill();
			return;
		}

		const crowd = game.crowdCenter();
		if (this.state === "idle") {
			if (game.phase === "run" && game.crowdSize() > 0 && this.position.z - crowd.z > -TRIGGER) {
				this.state = "fight";
				this.timer = 0;
				this.engaged = false;
			}
			return;
		}
		if (game.phase !== "run") return;

		// Players touching the boss hit it.
		const players = game.crowdPlayers();
		const touch = BOSS_RADIUS + CONTACT;
		const reach = BOSS_RADIUS + this.reach + 0.5;
		let hitting = 0;
		near.length = 0;
		for (const p of players) {
			if (p.state !== "run" || p.position.y > 0.6) continue;
			const px = p.position.x - this.position.x, pz = p.position.z - this.position.z;
			const d2 = px * px + pz * pz;
			if (d2 < touch * touch) hitting++;
			if (d2 < reach * reach) near.push(Math.atan2(-px, -pz));
		}

		// Turns to where the sword would hit the most players (the crowd when nobody is close).
		let goal = Math.atan2(-(crowd.x - this.position.x), -(crowd.z - this.position.z));
		if (near.length > 0) {
			let best = -1;
			for (let i = 0; i < DIRECTIONS; i++) {
				const yaw = this.yaw + (i / DIRECTIONS) * Math.PI * 2;
				let n = 0;
				for (const a of near) if (Math.cos(a - yaw) >= Math.cos(ARC / 2)) n++;
				if (n > best) {
					best = n;
					goal = yaw;
				}
			}
		}
		let diff = goal - this.yaw;
		diff = Math.atan2(Math.sin(diff), Math.cos(diff));
		this.yaw += diff * (1 - Math.exp(-TURN_SPEED * dt));
		if (hitting > 0) {
			this.hp = Math.max(0, this.hp - hitting * PLAYER_DPS * dt);
			this.flash = Math.min(1, this.flash + dt * 4);
			if (this.hp <= 0) {
				this.state = "dying";
				this.deathTime = 0;
				this.warning.material.opacity = 0;
				return;
			}
		}

		// The swings start once the crowd is within reach: the first one comes
		// right after a wind-up, then one every `interval`.
		if (!this.engaged) {
			if (near.length === 0) return;
			this.engaged = true;
			this.timer = Math.max(0, this.interval - WINDUP);
		}
		this.timer += dt;
		if (this.timer >= this.interval) {
			this.timer -= this.interval;
			this.swing(players, game);
		}
	}

	/** Kills the players in the sector in front of the boss, within reach of the sword. */
	private swing(players: readonly Player[], game: Game) {
		this.sinceSwing = 0;
		const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
		const cosHalf = Math.cos(ARC / 2);
		const reach = BOSS_RADIUS + this.reach;
		for (const p of players) {
			if (p.state !== "run" || p.position.y > 0.8) continue;
			const px = p.position.x - this.position.x, pz = p.position.z - this.position.z;
			const d = Math.hypot(px, pz);
			if (d > reach) continue;
			if (d > 0.01 && (px * fx + pz * fz) / d < cosHalf) continue;
			const k = 7 / Math.max(0.3, d);
			if (p.hurt(px * k, 7, pz * k)) this.kills++;
		}
		game.markCrowdDirty();
	}

	/** Pushes the players out of the body (it is solid). */
	pushOut(players: readonly Player[]) {
		if (this.state === "dying") return;
		for (const p of players) {
			if (p.position.y > 2.5) continue;
			const px = p.position.x - this.position.x, pz = p.position.z - this.position.z;
			const d2 = px * px + pz * pz;
			if (d2 >= BOSS_RADIUS * BOSS_RADIUS) continue;
			const d = Math.sqrt(d2);
			if (d < 1e-4) {
				p.position.z = this.position.z + BOSS_RADIUS;
				continue;
			}
			p.position.x = this.position.x + (px / d) * BOSS_RADIUS;
			p.position.z = this.position.z + (pz / d) * BOSS_RADIUS;
		}
	}

	update() {
		super.update();
		this.body.rotation.y = this.yaw;
		this.warning.rotation.y = this.yaw;
		for (const s of this.skins) s.emissiveIntensity = this.flash * 0.5;

		if (this.state === "dying") {
			const t = Math.min(1, this.deathTime / DEATH_TIME);
			this.body.rotation.x = Math.min(1, t * 2.5) * (Math.PI / 2);
			this.body.position.y = -t * t * 2;
			this.bar.visible = false;
			return;
		}

		// Sword: raised to the side during the wind-up, then a fast sweep.
		const untilSwing = this.interval - this.timer;
		const fighting = this.state === "fight";
		const windup = fighting ? Math.max(0, Math.min(1, 1 - untilSwing / WINDUP)) : 0;
		const swing = Math.min(1, this.sinceSwing / SWING_TIME);
		let angle: number;
		if (swing < 1) angle = ARC / 2 - swing * ARC;            // sweep left → right
		else if (windup > 0) angle = -ARC / 2 + windup * (ARC + 0.4); // brought back
		else angle = -ARC / 2 + (fighting ? 0 : ARC / 2);         // rest
		this.swordPivot.rotation.set(-windup * 0.5, angle, 0);
		this.warning.material.opacity = fighting ? windup * 0.45 + (swing < 1 ? 0.5 * (1 - swing) : 0) : 0;

		this.drawBar();
	}

	private drawBar() {
		const hp = Math.ceil(this.hp);
		if (hp === this.shownHp) return;
		this.shownHp = hp;
		const ctx = this.barCanvas.getContext("2d")!;
		ctx.clearRect(0, 0, 256, 64);
		ctx.fillStyle = "#1f1f1f";
		ctx.beginPath();
		ctx.roundRect(4, 14, 248, 40, 14);
		ctx.fill();
		ctx.fillStyle = "#ef4444";
		ctx.beginPath();
		ctx.roundRect(10, 20, Math.max(0, 236 * (this.hp / this.maxHp)), 28, 10);
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.font = "bold 30px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(String(hp), 128, 35);
		this.barTexture.needsUpdate = true;
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}
}
