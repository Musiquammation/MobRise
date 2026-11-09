import * as THREE from "three";
import { Hazard } from "../Hazard";
import type { Game } from "../../Game";
import type { Player } from "../Player";

/** Radius of the ball (with its spikes). */
const RADIUS = 0.95;

/** Spiked ball rolling across the track back and forth. */
export class SpikeBall extends Hazard {
	private readonly object: THREE.Object3D;
	private dir = 1;

	constructor(
		model: THREE.Object3D,
		z: number,
		private readonly speed: number,
		private readonly range: number,
		offset: number,
	) {
		super();
		this.object = model.clone();
		// offset in [0, 1]: starting point along the trip.
		this.position.set(-range + offset * 2 * range, RADIUS, z);
		this.hitboxHalf.set(0.75, 0.75, 0.75);
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
	}

	protected knockback(_player: Player) {
		return new THREE.Vector3(this.dir * 5, 6, 0);
	}

	update() {
		super.update();
		// Rolls on the floor.
		this.object.rotation.set(0, 0, -this.position.x / RADIUS);
	}
}
