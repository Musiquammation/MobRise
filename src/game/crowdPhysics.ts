/**
 * Crowd physics: every player is pulled toward the crowd center, and players
 * push each other away (circle collisions).
 *
 * Position-based dynamics: forces move the bodies, then overlaps and walls are
 * solved by moving the positions directly, then velocities are derived from
 * the actual displacement. Stable even with hundreds of players packed together.
 *
 * Kept free of imports so that it can be simulated outside the browser.
 */

export type Vec2Like = { x: number; z: number };

export type CrowdBody = {
	position: Vec2Like;
	velocity: Vec2Like;
	/** Position at the start of the step (internal). */
	prev: Vec2Like;
	/** Own attraction point, replaces the shared center when set (fights). */
	target?: Vec2Like | null;
	/** Cannot move sideways (x stays the same during the step). */
	lockX?: boolean;
};

/** Attraction toward the center: acceleration as a function of the distance. */
export type ForceFunction = (distance: number) => number;

export const FORCES = {
	/** Same pull for everyone (softened in the last 0.5 unit to avoid jitter). */
	constant: (d: number) => 40 * Math.min(1, d / 0.5),
	/** Spring: the further, the stronger. */
	linear: (d: number) => 20 * d,
	/** Between both: grows with the distance, but slower and slower. */
	sqrt: (d: number) => 28 * Math.sqrt(d),
	/** Constant pull plus a spring for the stragglers. */
	mixed: (d: number) => 26 * Math.min(1, d / 0.5) + 9 * d,
	/** Gravity-like: weaker with the distance. */
	inverse: (d: number) => 50 * Math.min(1, d / 0.5) / (1 + d),
} satisfies Record<string, ForceFunction>;

export type ForceName = keyof typeof FORCES;

export type CrowdOptions = {
	force: ForceFunction;
	/** Collision radius of a player. */
	radius: number;
	/** Walls (x range the bodies must stay in). */
	minX: number;
	maxX: number;
	/** Velocity damping (1/s). */
	damping: number;
	/** Max speed relative to the crowd (units/s). */
	maxSpeed: number;
	/** Collision solver iterations. */
	iterations: number;
	/** Optional back wall: the bodies stay at z >= minZ. */
	minZ?: number;
};

export const DEFAULT_CROWD_OPTIONS: Omit<CrowdOptions, "force" | "minX" | "maxX"> = {
	radius: 0.21,
	damping: 8,
	maxSpeed: 9,
	iterations: 3,
};

const grid = new Map<number, number[]>();

function cellKey(cx: number, cz: number) {
	return (cx + 32768) * 65536 + (cz + 32768);
}

/** Advances the crowd by dt. (cx, cz) is the point every body is attracted to. */
export function stepCrowd(bodies: readonly CrowdBody[], cx: number, cz: number, dt: number, o: CrowdOptions) {
	if (dt <= 0 || bodies.length === 0) return;
	const n = bodies.length;
	const damp = Math.exp(-o.damping * dt);

	// 1. Attraction, damping, integration.
	for (const b of bodies) {
		const p = b.position, v = b.velocity;
		b.prev.x = p.x;
		b.prev.z = p.z;

		const t = b.target;
		const dx = (t ? t.x : cx) - p.x, dz = (t ? t.z : cz) - p.z;
		const d = Math.hypot(dx, dz);
		if (d > 1e-6) {
			const a = o.force(d);
			v.x += (dx / d) * a * dt;
			v.z += (dz / d) * a * dt;
		}
		v.x *= damp;
		v.z *= damp;
		const s = Math.hypot(v.x, v.z);
		if (s > o.maxSpeed) {
			v.x *= o.maxSpeed / s;
			v.z *= o.maxSpeed / s;
		}
		if (b.lockX) v.x = 0;
		p.x += v.x * dt;
		p.z += v.z * dt;
	}

	// 2. Collisions (spatial hash, cell = one diameter).
	const diameter = o.radius * 2;
	const d2min = diameter * diameter;
	for (const list of grid.values()) list.length = 0;
	const cells = new Int32Array(n * 2);
	for (let i = 0; i < n; i++) {
		const p = bodies[i].position;
		const gx = Math.floor(p.x / diameter), gz = Math.floor(p.z / diameter);
		cells[i * 2] = gx;
		cells[i * 2 + 1] = gz;
		const key = cellKey(gx, gz);
		let list = grid.get(key);
		if (!list) grid.set(key, list = []);
		list.push(i);
	}

	for (let it = 0; it < o.iterations; it++) {
		for (let i = 0; i < n; i++) {
			const pi = bodies[i].position;
			const gx = cells[i * 2], gz = cells[i * 2 + 1];
			for (let ox = -1; ox <= 1; ox++) {
				for (let oz = -1; oz <= 1; oz++) {
					const list = grid.get(cellKey(gx + ox, gz + oz));
					if (!list) continue;
					for (const j of list) {
						if (j <= i) continue;
						const lockI = bodies[i].lockX, lockJ = bodies[j].lockX;
						const pj = bodies[j].position;
						let dx = pj.x - pi.x, dz = pj.z - pi.z;
						let d2 = dx * dx + dz * dz;
						if (d2 >= d2min) continue;
						if (d2 < 1e-10) {
							// Exactly on top of each other: pick a random direction.
							const a = Math.random() * Math.PI * 2;
							dx = Math.cos(a) * 1e-3;
							dz = Math.sin(a) * 1e-3;
							d2 = 1e-6;
						}
						const d = Math.sqrt(d2);
						const push = (diameter - d) / 2 / d;
						// A locked body leaves the whole sideways push to the other one.
						const sx = lockI || lockJ ? (lockI && lockJ ? 0 : 2) : 1;
						if (!lockI) pi.x -= dx * push * sx;
						pi.z -= dz * push;
						if (!lockJ) pj.x += dx * push * sx;
						pj.z += dz * push;
					}
				}
			}
		}

		// Walls.
		for (const b of bodies) {
			const p = b.position;
			if (b.lockX) p.x = b.prev.x;
			else if (p.x < o.minX) p.x = o.minX;
			else if (p.x > o.maxX) p.x = o.maxX;
			if (o.minZ !== undefined && p.z < o.minZ) p.z = o.minZ;
		}
	}

	// 3. Velocity = what actually happened.
	for (const b of bodies) {
		b.velocity.x = (b.position.x - b.prev.x) / dt;
		b.velocity.z = (b.position.z - b.prev.z) / dt;
	}
}
