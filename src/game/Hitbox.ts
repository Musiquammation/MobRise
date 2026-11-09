import * as THREE from "three";

/** Axis-aligned bounding box used for every collision of the game. */
export class Hitbox {
	readonly min = new THREE.Vector3();
	readonly max = new THREE.Vector3();

	set(center: THREE.Vector3, half: THREE.Vector3) {
		this.min.copy(center).sub(half);
		this.max.copy(center).add(half);
	}

	intersects(o: Hitbox): boolean {
		return this.min.x <= o.max.x && this.max.x >= o.min.x
			&& this.min.y <= o.max.y && this.max.y >= o.min.y
			&& this.min.z <= o.max.z && this.max.z >= o.min.z;
	}
}
