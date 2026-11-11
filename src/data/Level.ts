/**
 * JSON representation of a level (public/levels/*.json).
 *
 * Coordinates: `x` is lateral (0 = middle of the track, the track spans
 * [-width/2, width/2]), `z` is the distance from the start line (>= 0).
 * In the 3D world the crowd runs toward -Z, so worldZ = -z.
 */
export type LevelData = {
	/** Translation key in the `levels` section of src/i18n/locales. */
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
	 * "set": purple gate, the crowd becomes exactly `value` players (spawns or kills).
	 */
	gates: { z: number; x: number; width: number; type: "add" | "mul" | "pct" | "set"; value: number }[];
	/** Spiked balls rolling across the track at distance z. */
	spikes: { z: number; speed: number; offset?: number }[];
	/**
	 * Spike fields (x = center, z = start). With `period`, the spikes go up and
	 * down (up during the first `up` part of the cycle, default 0.5; `offset`
	 * in [0, 1) shifts it). No side by side blinking fields with alternating
	 * offsets ("double spikes"): too frustrating, removed from all levels.
	 */
	spikeFields?: { x: number; z: number; width: number; depth: number; period?: number; offset?: number; up?: number }[];
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
	/**
	 * Giant swordsmen blocking the track. The crowd stops and attacks them (each
	 * player touching the boss deals 1.5 damage/s); every `interval` seconds
	 * (default 1.5) the sword kills the players in front, within `reach`
	 * (default 1.2) of the body.
	 */
	bosses?: { x: number; z: number; hp: number; interval?: number; reach?: number }[];
	/**
	 * Speed strips (x = center, z = start): the crowd runs `factor` times faster
	 * (default 1.8) for `duration` seconds (default 1.2). Put one before a jump
	 * pad for a longer jump.
	 */
	boosts?: { x: number; z: number; width: number; depth?: number; factor?: number; duration?: number }[];
	/**
	 * Fans next to the track blowing the crowd sideways over [z, z + depth]:
	 * the crowd drifts at `strength` units/s (> 0 toward +x) unless the player
	 * steers against it. 2 = gentle, 4 = strong.
	 */
	winds?: { z: number; depth: number; strength: number }[];
	/** Groups of gray players waiting at (x, z): each one touched joins the crowd. */
	recruits?: { x: number; z: number; count: number }[];
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
		/** Turns (or swings) per second. */
		speed: number;
		/** Trajectory of the boxes (see game/boxPath.ts). Default: "ellipse". */
		path?: "ellipse" | "figure8" | "row" | "pendulum";
		/** Distance between two boxes for "row" and "pendulum". */
		spacing?: number;
		/** Sideways swing of the whole pattern (amplitude). */
		sway?: number;
		/** Turns per second of the sway. */
		swaySpeed?: number;
	};
};

export type LevelIndex = string[];
