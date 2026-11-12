/**
 * Headless level tester (Node, no browser): plays levels with the real game
 * code and the bot of src/debug/levelBot.ts, several levels in parallel.
 *
 * Usage (from the project root):
 *   node scripts/levelTest.mjs                       every level of the index
 *   node scripts/levelTest.mjs 25-35                 levels 25 to 35
 *   node scripts/levelTest.mjs 3,8,25 --offsets 0,1.3 --skin green --beam
 *
 * Options:
 *   --offsets a,b  seconds spent in the menu before starting (phase of the
 *                  blinking spikes, logs, archers...); one run per offset
 *   --skin id      equipped skin (default blue: no shield, no flight)
 *   --beam         beam search instead of the greedy look-ahead (slower,
 *                  finds "left then right" sequences)
 *   --jobs n       parallel processes (default: number of CPUs - 1)
 *   --fast         coarser bot (decisions every 0.4 s, 2 s look-ahead):
 *                  about twice faster, for level design iterations
 *
 * Exit code 1 when a run is lost.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = path.join(ROOT, "node_modules/.cache/levelTest/bot.mjs");

/** Minimal browser globals: the gameplay never draws, it only builds textures. */
function installStubs() {
	// Any property is a function returning the same object (gradients, measureText...).
	const ctx = new Proxy(function () {}, {
		get: (_t, k) => k === "width" ? 10 : k === Symbol.toPrimitive ? () => 0 : ctx,
		set: () => true,
		apply: () => ctx,
	});
	class HTMLElement {}
	class CanvasRenderingContext2D {}
	const canvas = () => ({ width: 1, height: 1, style: {}, getContext: () => ctx, addEventListener() {} });
	const g = globalThis;
	g.HTMLElement = HTMLElement;
	g.CanvasRenderingContext2D = CanvasRenderingContext2D;
	g.document = {
		createElement: canvas, addEventListener() {}, hidden: true,
		documentElement: { lang: "en" }, body: {},
	};
	g.window = g;
	g.innerWidth = 800;
	g.innerHeight = 600;
	g.addEventListener = () => {};
	g.location = { search: "" };
	Object.defineProperty(g, "navigator", { value: { language: "en", languages: ["en"] }, configurable: true });
	g.fetch = async u => {
		const file = path.join(ROOT, "public", String(u).replace(/^\//, ""));
		const text = fs.readFileSync(file, "utf8");
		return { ok: true, json: async () => JSON.parse(text), text: async () => text };
	};
}

async function build() {
	const { build } = await import("rolldown");
	await build({
		input: path.join(ROOT, "src/debug/levelBot.ts"),
		platform: "node",
		logLevel: "silent",
		output: { file: BUNDLE, format: "esm" },
	});
}

function parseArgs(argv) {
	const o = { levels: null, offsets: [0], skin: "blue", beam: false, fast: false, jobs: Math.max(1, os.cpus().length - 1) };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--offsets") o.offsets = argv[++i].split(",").map(Number);
		else if (a === "--skin") o.skin = argv[++i];
		else if (a === "--beam") o.beam = true;
		else if (a === "--fast") o.fast = true;
		else if (a === "--jobs") o.jobs = Number(argv[++i]);
		else o.levels = a;
	}
	return o;
}

/** "25-35" or "3,8,25" → file names (default: the index). */
function levelFiles(spec) {
	if (!spec) return JSON.parse(fs.readFileSync(path.join(ROOT, "public/levels/index.json"), "utf8"));
	const out = [];
	for (const part of spec.split(",")) {
		const [a, b] = part.split("-").map(Number);
		for (let n = a; n <= (b || a); n++) out.push(`level${n}.json`);
	}
	return out;
}

if (process.argv[2] === "--bench") {
	installStubs();
	const bot = await import(pathToFileURL(BUNDLE).href);
	const level = await bot.loadLevel(process.argv[3] ?? "level8.json");
	const g = bot.makeGame(level);
	g.start(null);
	bot.advance(g, 0, 5);
	let t = performance.now();
	for (let i = 0; i < 100; i++) bot.cloneGame(g);
	console.log("clone ms", (performance.now() - t) / 100);
	t = performance.now();
	for (let i = 0; i < 20; i++) bot.advance(bot.cloneGame(g), 0, 2.5);
	console.log("clone+advance 2.5s ms", (performance.now() - t) / 20, "crowd", g.crowd.length);
	process.exit(0);
} else if (process.argv[2] === "--child") {
	// One run: --child <file> <offset> <skin> <beam> <fast>
	const [, , , file, offset, skin, beam, fast] = process.argv;
	installStubs();
	const bot = await import(pathToFileURL(BUNDLE).href);
	const t0 = Date.now();
	const fn = beam === "1" ? bot.playLevelBeam : bot.playLevel;
	const r = await fn(file, { timeOffset: Number(offset), skin, ...fast === "1" ? { step: 0.4, horizon: 2 } : {} });
	process.send({ ...r, offset: Number(offset), seconds: Math.round((Date.now() - t0) / 1000) });
	process.exit(0);
} else {
	const o = parseArgs(process.argv.slice(2));
	await build();
	const queue = levelFiles(o.levels).flatMap(f => o.offsets.map(off => [f, off]));
	let failed = 0;
	const worker = async () => {
		while (queue.length) {
			const [file, off] = queue.shift();
			const r = await new Promise(resolve => {
				const child = fork(fileURLToPath(import.meta.url), ["--child", file, String(off), o.skin, o.beam ? "1" : "0", o.fast ? "1" : "0"]);
				let got = null;
				child.on("message", m => got = m);
				child.on("exit", () => resolve(got ?? { level: file, offset: off, won: false, final: 0, error: true, trace: [], losses: [] }));
			});
			if (!r.won) failed++;
			const big = r.losses.filter(l => l[1] >= 3).map(([z, n]) => `${n}@${z}`).join(" ");
			console.log(`${r.won ? "OK  " : "LOST"} ${file.padEnd(13)} offset=${off} final=${String(r.final).padStart(3)} (${r.seconds ?? "?"} s)${r.error ? " CRASH" : ""}`
				+ `\n     crowd (z:count) ${r.trace.filter((_, i) => i % 3 === 0).map(([z, n]) => `${z}:${n}`).join(" ")}`
				+ (big ? `\n     losses (n@z) ${big}` : ""));
		}
	};
	await Promise.all(Array.from({ length: o.jobs }, worker));
	process.exit(failed ? 1 : 0);
}
