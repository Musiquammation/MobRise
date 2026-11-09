import * as THREE from "three";
import type { Game } from "./Game";
import { Hitbox } from "./Hitbox";

const tmp = new THREE.Vector3();

export abstract class Entity {
	/** World position (for most entities: the point on the ground below them). */
	readonly position = new THREE.Vector3();
	readonly hitbox = new Hitbox();

	/** Half extents of the hitbox. */
	protected readonly hitboxHalf = new THREE.Vector3(0.5, 0.5, 0.5);
	/** Offset of the hitbox center from `position`. */
	protected readonly hitboxOffset = new THREE.Vector3();

	private alive = true;

	/** 3D object added to the scene, or null when rendered elsewhere (instancing). */
	abstract getObject(): THREE.Object3D | null;

	abstract frame(game: Game, dt: number): void;

	kill() {
		this.alive = false;
	}

	isAlive(): boolean {
		return this.alive;
	}

	refreshHitbox() {
		tmp.copy(this.position).add(this.hitboxOffset);
		this.hitbox.set(tmp, this.hitboxHalf);
	}

	/** Syncs the 3D object with the entity state. */
	update() {
		this.getObject()?.position.copy(this.position);
	}

	onSummon(_game: Game) {}
	onDeath(_game: Game) {}

	/** Frees GPU resources owned by this entity (not the shared ones). */
	dispose() {}
}
