import * as THREE from "three";
import { Entity } from "../Entity";
import type { Game } from "../Game";
import { GRAVITY } from "./Player";

/** Shots per second. */
const FIRE_RATE = 5;
/** Horizontal speed of the shot players. */
const SHOT_SPEED = 30;
const PIVOT_HEIGHT = 1.05;
const BARREL_LENGTH = 2.1;

const pivot = new THREE.Vector3();
const velocity = new THREE.Vector3();
const dir = new THREE.Vector3();
const muzzle = new THREE.Vector3();

/** Players walk into it at the end of the level, then get shot at the "?" boxes. */
export class Cannon extends Entity {
	ammo = 0;
	private readonly object = new THREE.Group();
	private readonly barrel: THREE.Object3D;
	private cooldown = 0;
	private recoil = 0;

	constructor(baseModel: THREE.Object3D, barrelModel: THREE.Object3D, z: number) {
		super();
		this.position.set(0, 0, z);
		this.object.add(baseModel.clone());
		this.barrel = barrelModel.clone();
		this.barrel.position.y = PIVOT_HEIGHT;
		this.barrel.rotation.order = "YXZ";
		this.object.add(this.barrel);
	}

	getObject() {
		return this.object;
	}

	load() {
		this.ammo++;
	}

	frame(game: Game, dt: number) {
		this.cooldown -= dt;
		this.recoil = Math.max(0, this.recoil - dt * 6);

		this.computeShot(game.aimPoint);
		dir.copy(velocity).normalize();
		this.barrel.rotation.y = Math.atan2(-dir.x, -dir.z);
		this.barrel.rotation.x = Math.asin(dir.y);
		this.barrel.position.z = this.recoil * 0.35;

		if (this.ammo > 0 && this.cooldown <= 0) {
			this.cooldown = 1 / FIRE_RATE;
			this.ammo--;
			this.recoil = 1;
			muzzle.copy(pivot).addScaledVector(dir, BARREL_LENGTH);
			muzzle.y -= 0.3; // player origin is at its feet
			game.spawnProjectile(muzzle, velocity);
		}
	}

	/** Velocity needed to reach `target` from the barrel pivot. */
	private computeShot(target: THREE.Vector3) {
		pivot.set(this.position.x, this.position.y + PIVOT_HEIGHT, this.position.z);
		const dx = target.x - pivot.x;
		const dy = target.y - pivot.y;
		const dz = target.z - pivot.z;
		const t = Math.max(0.2, Math.hypot(dx, dz) / SHOT_SPEED);
		velocity.set(dx / t, dy / t - 0.5 * GRAVITY * t, dz / t);
	}
}
