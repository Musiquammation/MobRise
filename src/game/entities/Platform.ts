import { Entity } from "../Entity";

/** Something players can stand on. */
export abstract class Platform extends Entity {
	/** Whether a player at (x, z) is held by this platform. */
	abstract isSupported(x: number, z: number): boolean;

	frame() {}
}
