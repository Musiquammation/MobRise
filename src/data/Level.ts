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
	/**
	 * Gates. Gates sharing the same z form a row: only one of them is taken.
	 * "pct": value is a percentage (10 = +10% of the players).
	 */
	gates: { z: number; x: number; width: number; type: "add" | "mul" | "pct"; value: number }[];
	/** Spiked balls rolling across the track at distance z. */
	spikes: { z: number; speed: number; offset?: number }[];
	/**
	 * Spike fields (x = center, z = start). With `period`, the spikes go up and
	 * down (up during the first half of the cycle, `offset` in [0, 1) shifts it).
	 */
	spikeFields?: { x: number; z: number; width: number; depth: number; period?: number; offset?: number }[];
	/**
	 * Saw blades going back and forth along `axis` around (x, z), over `length`.
	 * `speed` = average speed (units/s).
	 */
	saws?: { x: number; z: number; axis: "x" | "z"; length: number; speed: number; radius?: number; offset?: number }[];
	/**
	 * Archers standing next to the track (side -1 = left, 1 = right). They shoot
	 * at where the crowd will be: moving sideways dodges the arrow.
	 */
	archers?: { z: number; side: -1 | 1; interval?: number; offset?: number }[];
	/** Groups of red enemies waiting at (x, z). Each one kills one player. */
	enemies?: { x: number; z: number; count: number }[];
	/** Jump pads (x = center, z = start). `power` = vertical speed. */
	jumps?: { x: number; z: number; width: number; power?: number }[];
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
