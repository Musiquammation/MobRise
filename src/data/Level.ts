/**
 * JSON representation of a level (public/levels/*.json).
 *
 * Coordinates: `x` is lateral (0 = middle of the track, the track spans
 * [-width/2, width/2]), `z` is the distance from the start line (>= 0).
 * In the 3D world the crowd runs toward -Z, so worldZ = -z.
 */
export type LevelData = {
	name: string;
	/** Track width. */
	width: number;
	/** Distance from the start to the finish line. */
	length: number;
	/** Forward speed of the crowd (units/s). */
	speed: number;
	/** Number of players at start. */
	start: number;
	/** Rectangular holes in the floor. x = center, z = start of the hole. */
	holes: { x: number; z: number; width: number; depth: number }[];
	/** Gates. Gates sharing the same z form a row: only one of them is taken. */
	gates: { z: number; x: number; width: number; type: "add" | "mul"; value: number }[];
	/** Arrows flying across the track at distance z. */
	arrows: { z: number; speed: number; height?: number; offset?: number }[];
	/** Cannon bonus phase. */
	cannon: {
		/** Number of "?" boxes. */
		boxes: number;
		/** Distance between the cannon and the box loop. */
		distance: number;
		/** Height of the loop center. */
		height: number;
		/** Radii of the elliptic loop. */
		rx: number;
		ry: number;
		/** Turns per second. */
		speed: number;
	};
};

export type LevelIndex = string[];
