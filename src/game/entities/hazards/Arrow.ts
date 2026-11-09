import * as THREE from "three";
import { Hazard } from "../Hazard";
import type { Game } from "../../Game";
import type { Player } from "../Player";

/** Flies across the track back and forth. */
export class Arrow extends Hazard {
	private readonly object: THREE.Object3D;
	private dir = 1;
	private roll = 0;

	constructor(
		model: THREE.Object3D,
		z: number,
		private readonly speed: number,
		private readonly range: number,
		height: number,
		offset: number,
	) {
		super();
		this.object = model.clone();
		// offset in [0, 1]: starting point along the trip.
		this.position.set(-range + offset * 2 * range, height, z);
		this.hitboxHalf.set(0.9, 0.2, 0.15);
	}

	getObject() {
		return this.object;
	}

	frame(_game: Game, dt: number) {
		this.position.x += this.dir * this.speed * dt;
		if (Math.abs(this.position.x) > this.range) {
			this.position.x = Math.sign(this.position.x) * this.range;
			this.dir = -this.dir;
		}
		this.roll += dt * 10;
	}

	protected knockback(_player: Player) {
		return new THREE.Vector3(this.dir * 5, 6, 0);
	}

	update() {
		super.update();
		this.object.rotation.set(this.roll, this.dir > 0 ? 0 : Math.PI, 0);
	}
}
