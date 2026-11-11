/**
 * Dev-only level tester: plays a level with the real game code (no rendering)
 * and a bot that looks ahead by simulating copies of the game.
 *
 * Usage (browser console, vite dev server):
 *   const bot = await import("/src/debug/levelBot.ts");
 *   await bot.playLevel("level8.json", { timeOffset: 1.3 });
 */
import * as THREE from "three";
import { Game } from "../game/Game";
import type { LevelData } from "../data/Level";
import { SKINS } from "../data/skins";

const DT = 1 / 60;

/** Objects shared between the copies (rendering only, never read by the gameplay). */
function isShared(o: object): boolean {
	return o instanceof THREE.Object3D || o instanceof THREE.BufferGeometry || o instanceof THREE.Material
		|| o instanceof THREE.Texture || o instanceof HTMLElement || o instanceof CanvasRenderingContext2D
		|| typeof o === "function";
}

function deepClone<T>(root: T, shared: Set<object>): T {
	const memo = new Map<object, any>();
	const walk = (v: any): any => {
		if (v === null || typeof v !== "object") return v;
		if (shared.has(v) || isShared(v)) return v;
		const done = memo.get(v);
		if (done) return done;
		if (ArrayBuffer.isView(v)) {
			const c = (v as any).slice();
			memo.set(v, c);
			return c;
		}
		if (Array.isArray(v)) {
			const c: any[] = [];
			memo.set(v, c);
			for (const x of v) c.push(walk(x));
			return c;
		}
		if (v instanceof Map) {
			const c = new Map();
			memo.set(v, c);
			for (const [k, x] of v) c.set(walk(k), walk(x));
			return c;
		}
		if (v instanceof Set) {
			const c = new Set();
			memo.set(v, c);
			for (const x of v) c.add(walk(x));
			return c;
		}
		const c = Object.create(Object.getPrototypeOf(v));
		memo.set(v, c);
		for (const k of Reflect.ownKeys(v)) c[k] = walk(v[k]);
		return c;
	};
	return walk(root);
}

type G = any;

export function makeGame(level: LevelData): G {
	const renderer = { getSize: (v: THREE.Vector2) => v.set(800, 600), render() {} };
	const input = { x: null, y: null, presses: 0, down: false, reset() {} };
	const resources = { getModel: () => ({ scene: new THREE.Group() }) };
	const game: G = new Game(renderer as any, input as any, resources as any, level, SKINS[0], {
		onCoins() {}, onEnd() {},
	});
	return game;
}

export function cloneGame(game: G): G {
	const shared = new Set<object>([game.scene, game.renderer, game.input, game.resources, game.camera, game.callbacks]);
	const c = deepClone(game, shared);
	// The container callbacks capture the original game: rebind them.
	c.entities.callbacks = { onCreate: (e: any) => e.onSummon(c), onDelete: (e: any) => e.onDeath(c) };
	return c;
}

export function advance(game: G, x: number, seconds: number) {
	game.pointerX = x;
	const n = Math.round(seconds / DT);
	for (let i = 0; i < n && game.phase === "run"; i++) game.gameFrame(DT);
}

/** Players still alive (finished = everyone who reached the cannon). */
export function alive(game: G): number {
	if (game.phase === "run") return game.crowd.length;
	if (game.phase === "cannon") return game.entities.get("player").filter((p: any) => p.state === "gather").length;
	return 0;
}

export type BotOptions = {
	/** Time spent in the menu before starting (phase of the blinking spikes, archers...). */
	timeOffset?: number;
	/** Seconds between two decisions. */
	step?: number;
	/** Look-ahead (seconds). */
	horizon?: number;
	candidates?: number[];
};

export type BotResult = {
	level: string;
	won: boolean;
	final: number;
	/** z of the crowd and count, every second. */
	trace: [number, number][];
	/** Biggest losses (z, players lost in one decision step) not caused by gates. */
	losses: [number, number][];
};

export async function loadLevel(file: string): Promise<LevelData> {
	return (await fetch(`/levels/${file}`)).json();
}

export async function playLevel(file: string, o: BotOptions = {}): Promise<BotResult> {
	const level = await loadLevel(file);
	const step = o.step ?? 0.3, horizon = o.horizon ?? 2.5;
	const w = level.width / 2;
	const candidates = o.candidates ?? [-w - 1.5, -w + 1, -w + 2.2, -1, 0, 1, w - 2.2, w - 1, w + 1.5];
	const game = makeGame(level);
	// Time spent in the menu.
	const idle = Math.round((o.timeOffset ?? 0) / DT);
	for (let i = 0; i < idle; i++) game.gameFrame(DT);
	game.start(null);

	const trace: [number, number][] = [];
	const losses: [number, number][] = [];
	let x = 0, lastTrace = -1;
	while (game.phase === "run") {
		let best = x, bestScore = -Infinity;
		for (const cx of [x, ...candidates]) {
			const sim = cloneGame(game);
			advance(sim, cx, step);
			// Then keep going straight from there, or move again: best of a few follow-ups.
			let follow = -Infinity;
			for (const fx of [cx, candidates[0], 0, candidates[candidates.length - 1]]) {
				const s2 = cloneGame(sim);
				advance(s2, fx, horizon);
				follow = Math.max(follow, alive(s2) - (s2.phase === "run" && s2.crowd.length === 0 ? 1000 : 0));
			}
			const score = follow - Math.abs(cx - x) * 0.01;
			if (score > bestScore) {
				bestScore = score;
				best = cx;
			}
		}
		x = best;
		const before = alive(game);
		const gatesBefore = game.entities.get("gate").filter((g: any) => g.consumed).length;
		advance(game, x, step);
		const gatesAfter = game.entities.get("gate").filter((g: any) => g.consumed).length;
		const after = alive(game);
		const z = Math.round(-game.centerZ);
		if (gatesBefore === gatesAfter && after < before) losses.push([z, before - after]);
		if (Math.floor(game.time) !== lastTrace) {
			lastTrace = Math.floor(game.time);
			trace.push([z, after]);
		}
		(globalThis as any).botProgress = { file, z, count: after };
		// Yield (MessageChannel: not throttled like timers in a hidden tab).
		await new Promise<void>(r => {
			const c = new MessageChannel();
			c.port1.onmessage = () => r();
			c.port2.postMessage(0);
		});
	}
	const final = alive(game);
	return { level: file, won: game.phase === "cannon" && final > 0, final, trace, losses };
}

/** Plays every level of the index, one after the other (results in globalThis.botResults). */
export async function playAll(o: BotOptions = {}, files?: string[]) {
	files ??= await (await fetch("/levels/index.json")).json();
	const results: BotResult[] = (globalThis as any).botResults = [];
	for (const f of files!) results.push(await playLevel(f, o));
	return results;
}

type Beam = { game: G; x: number; history: [number, number][] };

/**
 * Beam search: every `step` seconds, each kept state tries every pointer
 * position; the best state of each lane (crowd x rounded) is kept. Finds
 * sequences like "left for the hole, then right for the spikes".
 */
export async function playLevelBeam(file: string, o: BotOptions & { width?: number } = {}): Promise<BotResult> {
	const level = await loadLevel(file);
	const step = o.step ?? 0.4;
	const w = level.width / 2;
	const candidates = o.candidates ?? [-w - 2, -w + 1, -w + 2, -1, 0, 1, w - 2, w - 1, w + 2];
	const start = makeGame(level);
	const idle = Math.round((o.timeOffset ?? 0) / DT);
	for (let i = 0; i < idle; i++) start.gameFrame(DT);
	start.start(null);

	let beams: Beam[] = [{ game: start, x: 0, history: [] }];
	let finished: Beam[] = [];
	let lastBest: Beam = beams[0];
	while (beams.length > 0) {
		lastBest = beams[0];
		const next: Beam[] = [];
		for (const b of beams) {
			for (const cx of candidates) {
				const g = cloneGame(b.game);
				advance(g, cx, step);
				const n = alive(g);
				if (n === 0) continue;
				const nb = { game: g, x: cx, history: [...b.history, [Math.round(-g.centerZ), n] as [number, number]] };
				(g.phase === "run" ? next : finished).push(nb);
			}
		}
		// Best state of each lane, then the best lanes.
		const lanes = new Map<number, Beam>();
		for (const b of next) {
			const k = Math.round(b.game.crowdX * 1.5);
			const cur = lanes.get(k);
			if (!cur || alive(b.game) > alive(cur.game)) lanes.set(k, b);
		}
		beams = [...lanes.values()].sort((a, b) => alive(b.game) - alive(a.game)).slice(0, o.width ?? 8);
		// Only keep finished runs that are better than every running one.
		const z = beams[0] ? Math.round(-beams[0].game.centerZ) : level.length;
		(globalThis as any).botProgress = { file, z, count: beams[0] ? alive(beams[0].game) : 0 };
		await new Promise<void>(r => {
			const c = new MessageChannel();
			c.port1.onmessage = () => r();
			c.port2.postMessage(0);
		});
	}
	finished.sort((a, b) => alive(b.game) - alive(a.game));
	const best = finished[0];
	if (!best) {
		const h = lastBest.history;
		return { level: file, won: false, final: 0, trace: h.slice(-12), losses: [] };
	}
	const losses: [number, number][] = [];
	for (let i = 1; i < best.history.length; i++)
		if (best.history[i][1] < best.history[i - 1][1]) losses.push([best.history[i][0], best.history[i - 1][1] - best.history[i][1]]);
	return { level: file, won: true, final: alive(best.game), trace: best.history.filter((_, i) => i % 3 === 0), losses };
}
