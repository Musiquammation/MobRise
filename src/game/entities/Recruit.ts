import { Entity } from "../Entity";
import type { Game } from "../Game";

/**
 * Gray player waiting on the track (a group of them is placed by the level).
 * A player of the crowd touching it makes it join the crowd: steer the crowd
 * through the group to collect it.
 */
export class Recruit extends Entity {
	readonly state = "run";
	readonly yaw = Math.PI; // facing the incoming crowd
	readonly spin = 0;
	readonly scale = 1;
	readonly animPhase = Math.random() * Math.PI * 2;

	constructor(x: number, z: number, readonly group: number) {
		super();
		this.position.set(x, 0, z);
	}

	getObject() {
		return null; // rendered by a PlayerRenderer (instancing)
	}

	frame(_game: Game, _dt: number) {}
}
