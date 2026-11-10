// Generates the minimal low-poly models of MobRise as self-contained .gltf files
// (geometry embedded as base64) into public/models.
// Run with: npm run models
//
// Each model is a list of primitives (box / cylinder / cone) grouped by material.
// Every material becomes one glTF primitive, so a model is a single mesh with a
// few draw calls. The material named "skin" is tinted at runtime (player skins).

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "models");

// ---------------------------------------------------------------- primitives

/** Axis-aligned box. s = size [w,h,d], p = center. */
function box(s, p) {
	const [hx, hy, hz] = s.map(v => v / 2);
	const faces = [
		// normal, u, v  (u x v = normal)
		[[1, 0, 0], [0, 0, -1], [0, 1, 0]],
		[[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
		[[0, 1, 0], [1, 0, 0], [0, 0, -1]],
		[[0, -1, 0], [1, 0, 0], [0, 0, 1]],
		[[0, 0, 1], [1, 0, 0], [0, 1, 0]],
		[[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
	];
	const pos = [], nor = [], idx = [];
	for (const [n, u, v] of faces) {
		const base = pos.length / 3;
		for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
			pos.push(
				p[0] + (n[0] + a * u[0] + b * v[0]) * hx,
				p[1] + (n[1] + a * u[1] + b * v[1]) * hy,
				p[2] + (n[2] + a * u[2] + b * v[2]) * hz,
			);
			nor.push(...n);
		}
		idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
	}
	return { pos, nor, idx };
}

/**
 * Cylinder (or cone when rTop = 0) of height h along `axis`, centered on p.
 * Built along +Y then rotated so +Y maps onto the requested axis.
 */
function cyl(rBottom, rTop, h, p, axis = "y", seg = 16) {
	const pos = [], nor = [], idx = [];
	const rot = {
		y: (x, y, z) => [x, y, z],
		x: (x, y, z) => [y, -x, z],   // rotate -90deg around Z : +Y -> +X
		z: (x, y, z) => [x, -z, y],   // rotate +90deg around X : +Y -> +Z
	}[axis];
	const push = (x, y, z, nx, ny, nz) => {
		const a = rot(x, y, z), b = rot(nx, ny, nz);
		pos.push(a[0] + p[0], a[1] + p[1], a[2] + p[2]);
		nor.push(...b);
	};
	const hh = h / 2;
	const slope = rBottom - rTop;
	const nl = Math.hypot(h, slope);

	// side
	for (let i = 0; i <= seg; i++) {
		const a = (i / seg) * Math.PI * 2;
		const s = Math.sin(a), c = Math.cos(a);
		push(s * rBottom, -hh, c * rBottom, (s * h) / nl, slope / nl, (c * h) / nl);
		push(s * rTop, hh, c * rTop, (s * h) / nl, slope / nl, (c * h) / nl);
	}
	for (let i = 0; i < seg; i++) {
		const b0 = i * 2, t0 = b0 + 1, b1 = b0 + 2, t1 = b0 + 3;
		idx.push(b0, b1, t0, t0, b1, t1);
	}

	// caps
	const cap = (r, y, up) => {
		if (r <= 0) return;
		const center = pos.length / 3;
		push(0, y, 0, 0, up ? 1 : -1, 0);
		for (let i = 0; i <= seg; i++) {
			const a = (i / seg) * Math.PI * 2;
			push(Math.sin(a) * r, y, Math.cos(a) * r, 0, up ? 1 : -1, 0);
		}
		for (let i = 0; i < seg; i++) {
			const p0 = center + 1 + i, p1 = p0 + 1;
			if (up) idx.push(center, p0, p1);
			else idx.push(center, p1, p0);
		}
	};
	cap(rTop, hh, true);
	cap(rBottom, -hh, false);
	return { pos, nor, idx };
}

/** UV sphere of radius r centered on p. */
function sphere(r, p, seg = 14, rings = 10) {
	const pos = [], nor = [], idx = [];
	for (let j = 0; j <= rings; j++) {
		const v = (j / rings) * Math.PI;
		for (let i = 0; i <= seg; i++) {
			const u = (i / seg) * Math.PI * 2;
			const n = [Math.sin(v) * Math.sin(u), Math.cos(v), Math.sin(v) * Math.cos(u)];
			pos.push(p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r);
			nor.push(...n);
		}
	}
	for (let j = 0; j < rings; j++)
		for (let i = 0; i < seg; i++) {
			const a = j * (seg + 1) + i, b = a + seg + 1;
			idx.push(a, b, a + 1, a + 1, b, b + 1);
		}
	return { pos, nor, idx };
}

/** Cones pointing outward along the 6 axes and the 8 diagonals, starting at distance d. */
function spikes(d, len, r) {
	const out = [];
	const dirs = [];
	for (const a of [-1, 1]) dirs.push([a, 0, 0], [0, a, 0], [0, 0, a]);
	for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) dirs.push([x, y, z].map(v => v / Math.sqrt(3)));
	for (const dir of dirs) {
		// Cone along +Y, then rotated so +Y maps onto `dir`.
		const g = cyl(r, 0, len, [0, d + len / 2, 0], "y", 8);
		const up = [0, 1, 0];
		const axis = [up[1] * dir[2] - up[2] * dir[1], up[2] * dir[0] - up[0] * dir[2], up[0] * dir[1] - up[1] * dir[0]];
		const sin = Math.hypot(...axis), cos = dir[1];
		const k = sin > 1e-6 ? axis.map(v => v / sin) : [1, 0, 0];
		const rot = v => {
			// Rodrigues rotation (dir = ±Y: identity or 180deg around X).
			const c = cos, s = sin;
			const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
			const kx = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
			return [0, 1, 2].map(i => v[i] * c + kx[i] * s + k[i] * kv * (1 - c));
		};
		for (let i = 0; i < g.pos.length; i += 3) {
			const a = rot(g.pos.slice(i, i + 3)), n = rot(g.nor.slice(i, i + 3));
			g.pos.splice(i, 3, ...a);
			g.nor.splice(i, 3, ...n);
		}
		out.push(["steel", g]);
	}
	return out;
}

// ---------------------------------------------------------------- materials

const MATERIALS = {
	skin: { color: [1, 1, 1], roughness: 0.6 },          // tinted at runtime
	white: { color: [1, 1, 1], roughness: 0.5 },
	dark: { color: [0.08, 0.08, 0.1], roughness: 0.5 },
	red: { color: [0.86, 0.15, 0.18], roughness: 0.5 },
	pink: { color: [1, 0.42, 0.72], roughness: 0.5 },
	gold: { color: [1, 0.78, 0.15], roughness: 0.45 },
	goldDark: { color: [0.8, 0.5, 0.06], roughness: 0.5 },
	brown: { color: [0.45, 0.27, 0.12], roughness: 0.8 },
	metal: { color: [0.3, 0.32, 0.36], roughness: 0.35, metallic: 0.6 },
	metalLight: { color: [0.62, 0.64, 0.68], roughness: 0.3, metallic: 0.6 },
	steel: { color: [0.85, 0.86, 0.9], roughness: 0.25, metallic: 0.7 },
	blue: { color: [0.2, 0.55, 1], roughness: 0.5 },
	purple: { color: [0.42, 0.2, 0.85], roughness: 0.5 },
	horn: { color: [0.96, 0.9, 0.76], roughness: 0.6 },
	glow: { color: [1, 0.92, 0.45], roughness: 0.2, metallic: 0.3 },
};

/** Ring of small boxes (flat, around Y) of radius r at height y. */
function ring(mat, r, y, count, size) {
	const out = [];
	for (let i = 0; i < count; i++) {
		const a = (i / count) * Math.PI * 2;
		out.push([mat, box([size, size * 0.6, size], [Math.cos(a) * r, y, Math.sin(a) * r])]);
	}
	return out;
}

// ---------------------------------------------------------------- models

/** "?" glyph, 5x7 pixels, top row first. */
const QUESTION = [
	".###.",
	"#...#",
	"....#",
	"...#.",
	"..#..",
	".....",
	"..#..",
];

function questionGlyph(faceZ, dir) {
	const out = [];
	const px = 0.13;
	QUESTION.forEach((row, r) => {
		[...row].forEach((ch, c) => {
			if (ch !== "#") return;
			const x = (c - 2) * px * dir;
			const y = (3 - r) * px;
			out.push(["white", box([px, px, 0.06], [x, y, faceZ])]);
		});
	});
	return out;
}

const MODELS = {
	// Origin at the feet, facing -Z (running direction). Height ~1.07.
	player: [
		["skin", box([0.14, 0.36, 0.16], [-0.09, 0.18, 0])],
		["skin", box([0.14, 0.36, 0.16], [0.09, 0.18, 0])],
		["skin", box([0.42, 0.42, 0.26], [0, 0.56, 0])],
		["skin", box([0.1, 0.34, 0.12], [-0.27, 0.58, 0])],
		["skin", box([0.1, 0.34, 0.12], [0.27, 0.58, 0])],
		["skin", box([0.34, 0.3, 0.3], [0, 0.92, 0])],
		["white", box([0.09, 0.09, 0.02], [-0.08, 0.95, -0.155])],
		["white", box([0.09, 0.09, 0.02], [0.08, 0.95, -0.155])],
		["dark", box([0.045, 0.06, 0.02], [-0.08, 0.94, -0.165])],
		["dark", box([0.045, 0.06, 0.02], [0.08, 0.94, -0.165])],
	],

	// Hats: origin = top of the player's head.
	hat_cap: [
		["red", box([0.36, 0.1, 0.32], [0, 0.05, 0])],
		["red", box([0.3, 0.03, 0.16], [0, 0.015, -0.23])],
		["white", box([0.06, 0.03, 0.06], [0, 0.115, 0])],
	],
	hat_crown: [
		["gold", box([0.38, 0.1, 0.34], [0, 0.05, 0])],
		["gold", box([0.08, 0.12, 0.08], [-0.14, 0.16, -0.12])],
		["gold", box([0.08, 0.12, 0.08], [0.14, 0.16, -0.12])],
		["gold", box([0.08, 0.12, 0.08], [-0.14, 0.16, 0.12])],
		["gold", box([0.08, 0.12, 0.08], [0.14, 0.16, 0.12])],
		["red", box([0.07, 0.07, 0.02], [0, 0.05, -0.175])],
	],
	hat_party: [
		["pink", cyl(0.15, 0, 0.36, [0, 0.18, 0])],
		["white", box([0.08, 0.08, 0.08], [0, 0.38, 0])],
	],
	hat_band: [
		["red", box([0.36, 0.06, 0.32], [0, -0.1, 0])],
		["red", box([0.04, 0.05, 0.16], [0.05, -0.12, 0.22])],
		["red", box([0.04, 0.05, 0.16], [-0.05, -0.14, 0.22])],
	],

	hat_wizard: [
		["purple", cyl(0.3, 0.3, 0.03, [0, 0.015, 0])],
		["purple", cyl(0.17, 0, 0.46, [0, 0.26, 0])],
		["gold", box([0.06, 0.06, 0.02], [0, 0.16, -0.13])],
	],
	hat_viking: [
		["metalLight", box([0.38, 0.12, 0.34], [0, 0.04, 0])],
		["metalLight", box([0.28, 0.06, 0.26], [0, 0.13, 0])],
		["gold", box([0.04, 0.16, 0.36], [0, 0.07, 0])],
		["horn", cyl(0, 0.06, 0.2, [-0.28, 0.1, 0], "x")],
		["horn", cyl(0.06, 0, 0.2, [0.28, 0.1, 0], "x")],
	],
	hat_halo: ring("glow", 0.2, 0.13, 16, 0.075),

	// Origin at the bottom of the post.
	gate_post: [
		["white", box([0.24, 2.6, 0.24], [0, 1.3, 0])],
		["metal", box([0.32, 0.12, 0.32], [0, 0.06, 0])],
		["metal", box([0.32, 0.12, 0.32], [0, 2.6, 0])],
	],

	// Flies along +X. Origin at its center.
	// Rolling hazard. Origin at its center, radius ~0.95 with the spikes.
	spike_ball: [
		["red", sphere(0.55, [0, 0, 0])],
		...spikes(0.5, 0.42, 0.16),
	],

	// Origin at the ground, center of the base. Faces -Z.
	cannon_base: [
		["brown", box([1.5, 0.5, 1.8], [0, 0.45, 0.1])],
		["brown", box([0.2, 0.6, 1], [-0.62, 1, 0])],
		["brown", box([0.2, 0.6, 1], [0.62, 1, 0])],
		["dark", cyl(0.45, 0.45, 0.18, [-0.85, 0.45, -0.4], "x")],
		["dark", cyl(0.45, 0.45, 0.18, [0.85, 0.45, -0.4], "x")],
		["dark", cyl(0.45, 0.45, 0.18, [-0.85, 0.45, 0.6], "x")],
		["dark", cyl(0.45, 0.45, 0.18, [0.85, 0.45, 0.6], "x")],
		["metalLight", cyl(0.12, 0.12, 1.9, [0, 0.45, -0.4], "x", 8)],
		["metalLight", cyl(0.12, 0.12, 1.9, [0, 0.45, 0.6], "x", 8)],
	],
	// Origin at the pivot. The muzzle points to -Z.
	cannon_barrel: [
		["metal", cyl(0.5, 0.42, 2.4, [0, 0, -0.8], "z")],
		["metalLight", cyl(0.54, 0.54, 0.22, [0, 0, -2.0], "z")],
		["dark", cyl(0.34, 0.34, 0.05, [0, 0, -2.12], "z")],
		["metalLight", cyl(0.56, 0.56, 0.2, [0, 0, 0.3], "z")],
		["metal", box([0.2, 0.2, 0.2], [0, 0, 0.5])],
	],

	// 1.2 cube centered on the origin, "?" on front (+Z) and back (-Z).
	mystery_box: [
		["gold", box([1.2, 1.2, 1.2], [0, 0, 0])],
		["goldDark", box([0.12, 0.12, 0.04], [-0.48, 0.48, 0.61])],
		["goldDark", box([0.12, 0.12, 0.04], [0.48, 0.48, 0.61])],
		["goldDark", box([0.12, 0.12, 0.04], [-0.48, -0.48, 0.61])],
		["goldDark", box([0.12, 0.12, 0.04], [0.48, -0.48, 0.61])],
		...questionGlyph(0.62, 1),
		...questionGlyph(-0.62, -1),
	],

	// Faces +Z. Origin at its center.
	coin: [
		["gold", cyl(0.35, 0.35, 0.08, [0, 0, 0], "z", 20)],
		["goldDark", cyl(0.24, 0.24, 0.1, [0, 0, 0], "z", 20)],
	],
};

// ---------------------------------------------------------------- glTF writer

function writeGltf(name, parts) {
	// Merge every part sharing the same material.
	const groups = new Map();
	for (const [mat, geo] of parts) {
		if (!MATERIALS[mat]) throw new Error(`Unknown material ${mat}`);
		const g = groups.get(mat) ?? { pos: [], nor: [], idx: [] };
		const offset = g.pos.length / 3;
		g.pos.push(...geo.pos);
		g.nor.push(...geo.nor);
		g.idx.push(...geo.idx.map(i => i + offset));
		groups.set(mat, g);
	}

	const chunks = [];
	let byteLength = 0;
	const bufferViews = [], accessors = [], primitives = [], materials = [];

	const addView = (typed, target) => {
		const pad = (4 - (byteLength % 4)) % 4;
		if (pad) { chunks.push(Buffer.alloc(pad)); byteLength += pad; }
		const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
		bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buf.length, target });
		chunks.push(buf);
		byteLength += buf.length;
		return bufferViews.length - 1;
	};

	for (const [mat, g] of groups) {
		const pos = new Float32Array(g.pos);
		const nor = new Float32Array(g.nor);
		const idx = pos.length / 3 > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx);

		const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
		for (let i = 0; i < pos.length; i += 3)
			for (let k = 0; k < 3; k++) {
				min[k] = Math.min(min[k], pos[i + k]);
				max[k] = Math.max(max[k], pos[i + k]);
			}

		accessors.push({ bufferView: addView(pos, 34962), componentType: 5126, count: pos.length / 3, type: "VEC3", min, max });
		const posA = accessors.length - 1;
		accessors.push({ bufferView: addView(nor, 34962), componentType: 5126, count: nor.length / 3, type: "VEC3" });
		const norA = accessors.length - 1;
		accessors.push({ bufferView: addView(idx, 34963), componentType: idx instanceof Uint32Array ? 5125 : 5123, count: idx.length, type: "SCALAR" });
		const idxA = accessors.length - 1;

		const m = MATERIALS[mat];
		materials.push({
			name: mat,
			pbrMetallicRoughness: {
				baseColorFactor: [...m.color, 1],
				metallicFactor: m.metallic ?? 0,
				roughnessFactor: m.roughness ?? 0.6,
			},
		});
		primitives.push({ attributes: { POSITION: posA, NORMAL: norA }, indices: idxA, material: materials.length - 1 });
	}

	const data = Buffer.concat(chunks);
	const gltf = {
		asset: { version: "2.0", generator: "MobRise genModels" },
		scene: 0,
		scenes: [{ nodes: [0] }],
		nodes: [{ name, mesh: 0 }],
		meshes: [{ name, primitives }],
		materials,
		accessors,
		bufferViews,
		buffers: [{ byteLength: data.length, uri: `data:application/octet-stream;base64,${data.toString("base64")}` }],
	};
	writeFileSync(join(OUT, `${name}.gltf`), JSON.stringify(gltf));
	return data.length;
}

mkdirSync(OUT, { recursive: true });
for (const [name, parts] of Object.entries(MODELS)) {
	const bytes = writeGltf(name, parts);
	console.log(`${name}.gltf  (${bytes} bytes of geometry)`);
}
