import * as THREE from "three";
import { Hazard } from "../Hazard";
import type { Game } from "../../Game";
import type { Player } from "../Player";
import { CountLabel } from "../../CountLabel";
import { audio } from "../../../audio/audio";

const HEIGHT = 1.5;
const DEPTH = 0.6;
const BRICK_W = 0.5;
const BRICK_H = 0.25;
const GRAVITY = -20;
/** Duration of the collapse (the bricks fall, then disappear). */
const BREAK_TIME = 1.4;

const brickGeometry = new THREE.BoxGeometry(BRICK_W * 0.94, BRICK_H * 0.9, DEPTH);
const matrix = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler();
const scale = new THREE.Vector3(1, 1, 1);
const pos = new THREE.Vector3();

type Debris = { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; spin: number };

/**
 * Brick wall to break: each player running into it is spent (dies, shield or
 * not) and removes one point. At 0 it collapses and the way is free.
 * Narrower than the track, it can be avoided; a full-width wall must be paid.
 */
export class Wall extends Hazard {
	hp: number;
	private readonly object = new THREE.Group();
	private readonly bricks: THREE.InstancedMesh;
	private readonly material: THREE.MeshStandardMaterial;
	private readonly label = new CountLabel("#b45309");
	private readonly rest: { x: number; y: number }[] = [];
	private debris: Debris[] | null = null;
	private breakTime = 0;
	/** Shake after a hit (s). */
	private shake = 0;

	constructor(x: number, z: number, private readonly width: number, hp: number) {
		super();
		this.hp = hp;
		// z = front of the wall (distance).
		this.position.set(x, 0, -z - DEPTH / 2);
		this.hitboxHalf.set(width / 2, HEIGHT / 2, DEPTH / 2);
		this.hitboxOffset.set(0, HEIGHT / 2, 0);

		// Staggered rows of bricks.
		const rows = Math.round(HEIGHT / BRICK_H);
		for (let r = 0; r < rows; r++) {
			const shift = r % 2 ? BRICK_W / 2 : 0;
			for (let bx = -width / 2 + BRICK_W / 2 - shift; bx < width / 2; bx += BRICK_W) {
				// Clipped at the edges: half bricks are drawn narrower (kept as whole positions).
				const cx = Math.max(-width / 2 + BRICK_W * 0.25, Math.min(width / 2 - BRICK_W * 0.25, bx));
				this.rest.push({ x: cx, y: (r + 0.5) * BRICK_H });
			}
		}
		this.material = new THREE.MeshStandardMaterial({ color: "#c2410c", roughness: 0.85 });
		this.bricks = new THREE.InstancedMesh(brickGeometry, this.material, this.rest.length);
		const tints = [new THREE.Color("#c2410c"), new THREE.Color("#b45309"), new THREE.Color("#9a3412"), new THREE.Color("#d9622b")];
		this.rest.forEach((_, i) => this.bricks.setColorAt(i, tints[(i * 7) % tints.length]));
		this.placeBricks(0);
		this.object.add(this.bricks);

		this.object.add(this.label.sprite);
		this.label.set(this.hp, 0, HEIGHT + 0.6, 0);
	}

	getObject() {
		return this.object;
	}

	isBroken(): boolean {
		return this.hp <= 0;
	}

	onPlayerHit(player: Player, game: Game) {
		if (this.hp <= 0) return;
		this.hp--;
		this.shake = 0.15;
		// Spent on the wall: bounces back, shield or not.
		player.die((player.position.x - this.position.x) * 0.5, 4, 3);
		game.markCrowdDirty();
		if (this.hp <= 0) this.collapse(player.position.x);
	}

	private collapse(fromX: number) {
		audio.play("boost", { rate: 0.6 });
		this.debris = this.rest.map(b => ({
			x: b.x, y: b.y, z: 0,
			vx: (b.x - (fromX - this.position.x)) * 1.5 + (Math.random() - 0.5) * 2,
			vy: 2 + Math.random() * 4,
			vz: -4 - Math.random() * 4,
			rx: 0, ry: 0, spin: (Math.random() - 0.5) * 12,
		}));
	}

	frame(_game: Game, dt: number) {
		this.shake = Math.max(0, this.shake - dt);
		if (!this.debris) return;
		this.breakTime += dt;
		for (const d of this.debris) {
			d.vy += GRAVITY * dt;
			d.x += d.vx * dt;
			d.y += d.vy * dt;
			d.z += d.vz * dt;
			if (d.y < BRICK_H / 2) {
				d.y = BRICK_H / 2;
				d.vy = 0;
				d.vx *= 0.8;
				d.vz *= 0.8;
			}
			d.rx += d.spin * dt;
			d.ry += d.spin * 0.6 * dt;
		}
		if (this.breakTime > BREAK_TIME) this.kill();
	}

	private placeBricks(time: number) {
		const k = this.debris ? Math.max(0, 1 - Math.max(0, this.breakTime - BREAK_TIME * 0.6) / (BREAK_TIME * 0.4)) : 1;
		this.rest.forEach((b, i) => {
			const d = this.debris?.[i];
			const jitter = this.shake > 0 ? Math.sin(time * 90 + i) * 0.03 : 0;
			pos.set(d ? d.x : b.x + jitter, d ? d.y : b.y, d ? d.z : 0);
			quat.setFromEuler(euler.set(d?.rx ?? 0, d?.ry ?? 0, 0));
			scale.setScalar(k);
			const narrow = Math.abs(b.x) > this.width / 2 - BRICK_W * 0.5 ? 0.5 : 1;
			matrix.compose(pos, quat, scale.set(k * narrow, k, k));
			this.bricks.setMatrixAt(i, matrix);
		});
		this.bricks.instanceMatrix.needsUpdate = true;
	}

	update() {
		super.update();
		this.placeBricks(performance.now() / 1000);
		this.label.set(this.hp, 0, HEIGHT + 0.6, 0);
	}

	dispose() {
		this.bricks.dispose();
		this.material.dispose();
		this.label.dispose();
	}
}
