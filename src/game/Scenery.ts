import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LevelData } from "../data/Level";
import { FLOOR_AFTER, FLOOR_BEFORE, type Floor } from "./entities/platforms/Floor";
import { hash, type Theme } from "./themes";

/**
 * Everything around the track that the gameplay ignores: sky, sea, floating
 * islands, clouds, distant mountains and the pillars holding the track.
 * Built once per level (seeded by the level, so a level always looks the same)
 * and merged into a handful of meshes to stay cheap on phones.
 */

/** Height of the sea (the players falling in a hole die before reaching it). */
const SEA_Y = -18;
const SKY_RADIUS = 280;
const SEA_CELLS = 20;
const SEA_SIZE = 560;

type Cloud = { x: number; y: number; z: number; s: number; yaw: number; speed: number };

const matrix = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const vec = new THREE.Vector3();
const scl = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Scenery {
	readonly group = new THREE.Group();
	private readonly disposables: { dispose(): void }[] = [];
	private readonly sky: THREE.Mesh;
	private readonly sea: THREE.Mesh;
	private readonly mountains: THREE.Mesh;
	private readonly clouds: THREE.InstancedMesh;
	private readonly cloudData: Cloud[] = [];
	private readonly seaTime = { value: 0 };
	/** How far from the track the islands are (1 = as built, less on narrow screens). */
	private readonly islandSpread = { value: 1 };
	/**
	 * Every random stream derives from this seed (one per part, one per island).
	 */
	private readonly seed: number;

	constructor(level: LevelData, floor: Floor, readonly theme: Theme) {
		this.seed = hash(level.name) ^ level.length * 7919;
		const half = level.width / 2;
		const dMin = -FLOOR_BEFORE - 70;
		const dMax = level.length + FLOOR_AFTER + 140;

		this.sky = this.buildSky();
		this.sea = this.buildSea();
		this.mountains = this.buildMountains();
		this.group.add(this.sky, this.sea, this.mountains);
		this.group.add(this.buildIslands(half, dMin, dMax));
		this.group.add(this.buildPillars(floor, half, level.length + FLOOR_AFTER));
		this.clouds = this.buildClouds(half, dMin, dMax);
		this.group.add(this.clouds);
	}

	private rng(stream: number): () => number {
		return mulberry32(this.seed + stream * 1013904223);
	}

	/** Keeps the far things (sky, sea, mountains) around the camera, animates the rest. */
	update(camera: THREE.Camera, time: number, dt: number) {
		const p = camera.position;
		this.sky.position.copy(p);
		this.mountains.position.set(p.x, SEA_Y, p.z);
		// Snapped to the grid of the sea: the waves (computed in world space) stay still.
		const cell = SEA_SIZE / SEA_CELLS;
		this.sea.position.set(Math.round(p.x / cell) * cell, SEA_Y, Math.round(p.z / cell) * cell);
		this.seaTime.value = time;

		for (let i = 0; i < this.clouds.count; i++) {
			const c = this.cloudData[i];
			c.x += c.speed * dt;
			if (c.x > 90) c.x -= 180;
			quat.setFromAxisAngle(UP, c.yaw);
			matrix.compose(vec.set(c.x, c.y + Math.sin(time * 0.4 + i) * 0.3, c.z), quat, scl.set(c.s, c.s * 0.75, c.s));
			this.clouds.setMatrixAt(i, matrix);
		}
		this.clouds.instanceMatrix.needsUpdate = true;
	}

	/**
	 * Narrow (portrait) screens only show a thin strip around the track: the
	 * islands come closer so they are seen, never closer than ISLAND_MARGIN.
	 */
	setAspect(aspect: number) {
		this.islandSpread.value = Math.min(1, Math.max(0.25, aspect / 1.3));
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}

	private own<T extends { dispose(): void }>(o: T): T {
		this.disposables.push(o);
		return o;
	}

	// ------------------------------------------------------------- sky

	private buildSky(): THREE.Mesh {
		const t = this.theme;
		const material = this.own(new THREE.ShaderMaterial({
			side: THREE.BackSide,
			depthWrite: false,
			fog: false,
			uniforms: {
				top: { value: new THREE.Color(t.skyTop) },
				horizon: { value: new THREE.Color(t.skyHorizon) },
				glow: { value: new THREE.Color(t.sunGlow) },
				sunDir: { value: new THREE.Vector3(...t.sunDir).normalize() },
			},
			vertexShader: /* glsl */`
				varying vec3 vDir;
				void main() {
					vDir = normalize(position);
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}`,
			fragmentShader: /* glsl */`
				uniform vec3 top;
				uniform vec3 horizon;
				uniform vec3 glow;
				uniform vec3 sunDir;
				varying vec3 vDir;
				void main() {
					vec3 dir = normalize(vDir);
					float h = max(dir.y, 0.0);
					vec3 col = mix(horizon, top, pow(h, 0.55));
					float s = max(dot(dir, sunDir), 0.0);
					col = mix(col, glow, pow(s, 6.0) * 0.55);
					col += glow * smoothstep(0.9975, 0.999, s);
					gl_FragColor = vec4(col, 1.0);
					#include <tonemapping_fragment>
					#include <colorspace_fragment>
				}`,
		}));
		const mesh = new THREE.Mesh(this.own(new THREE.SphereGeometry(SKY_RADIUS, 16, 8)), material);
		mesh.renderOrder = -10;
		mesh.frustumCulled = false;
		return mesh;
	}

	// ------------------------------------------------------------- sea

	private buildSea(): THREE.Mesh {
		const geometry = this.own(new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_CELLS, SEA_CELLS).rotateX(-Math.PI / 2));
		const material = this.own(new THREE.MeshStandardMaterial({
			color: this.theme.sea, roughness: 0.25, metalness: 0.1, flatShading: true,
		}));
		const time = this.seaTime;
		material.onBeforeCompile = shader => {
			shader.uniforms.uTime = time;
			shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader.replace(
				"#include <begin_vertex>",
				`#include <begin_vertex>
				vec4 seaWorld = modelMatrix * vec4(transformed, 1.0);
				transformed.y += sin(seaWorld.x * 0.21 + uTime * 1.1) * 0.45
					+ cos(seaWorld.z * 0.17 + uTime * 0.8) * 0.45
					+ sin((seaWorld.x + seaWorld.z) * 0.43 + uTime * 1.9) * 0.18;`,
			);
		};
		const mesh = new THREE.Mesh(geometry, material);
		mesh.frustumCulled = false;
		return mesh;
	}

	// ------------------------------------------------------------- mountains

	/** A ring of hazy peaks far away, following the camera (they look infinitely far). */
	private buildMountains(): THREE.Mesh {
		const t = this.theme;
		const haze = new THREE.Color(t.skyHorizon);
		const geos: THREE.BufferGeometry[] = [];
		const rings = [{ n: 24, dist: 220, h: 0.8, fade: 0.55 }];
		for (const [k, ring] of rings.entries()) {
			const rng = this.rng(10 + k);
			const base = new THREE.Color(t.mountain).lerp(haze, ring.fade);
			const snow = new THREE.Color(t.snow).lerp(haze, ring.fade * 0.6);
			for (let i = 0; i < ring.n; i++) {
				const a = (i + rng() * 0.6) / ring.n * Math.PI * 2;
				const height = (16 + rng() * 22) * ring.h;
				const radius = 18 + rng() * 20;
				const g = jitter(new THREE.ConeGeometry(radius, height, 5 + Math.floor(rng() * 2), 1), radius * 0.12, rng);
				g.translate(0, height / 2, 0);
				paintBy(g, (_n, y) => y > height * 0.68 ? snow : base);
				g.rotateY(rng() * Math.PI);
				g.translate(Math.cos(a) * ring.dist, 0, Math.sin(a) * ring.dist);
				geos.push(g);
			}
		}
		const material = this.own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }));
		const mesh = new THREE.Mesh(this.own(merge(geos)), material);
		mesh.frustumCulled = false;
		mesh.renderOrder = -5;
		return mesh;
	}

	// ------------------------------------------------------------- islands

	private buildIslands(half: number, dMin: number, dMax: number): THREE.Mesh {
		const geos: THREE.BufferGeometry[] = [];
		const rng = this.rng(1);
		let k = 0;
		for (const side of [-1, 1]) {
			// Close ones, next to the track (beyond the archers and the spike balls).
			for (let d = dMin + rng() * 12; d < dMax; d += 15 + rng() * 18) {
				const r = 1.8 + rng() * 3.4;
				const x = side * (half + ISLAND_MARGIN + r + rng() * 16);
				geos.push(withGap(this.island(this.rng(1000 + k++), r, x, -1.2 - rng() * 4.5, -d), x, r, half));
			}
			// Big ones in the distance.
			for (let d = dMin + rng() * 30; d < dMax + 60; d += 40 + rng() * 35) {
				const r = 5 + rng() * 8;
				const x = side * (half + 34 + rng() * 45);
				const y = -4 - rng() * 8;
				const islandRng = this.rng(1000 + k++);
				geos.push(withGap(this.island(islandRng, r, x, y, -d), x, r, half));
			}
		}
		const material = this.own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
		const spread = this.islandSpread;
		material.onBeforeCompile = shader => {
			shader.uniforms.uSpread = spread;
			shader.vertexShader = "attribute float gap;\nuniform float uSpread;\n" + shader.vertexShader.replace(
				"#include <begin_vertex>",
				"#include <begin_vertex>\ntransformed.x += gap * (uSpread - 1.0);",
			);
		};
		const mesh = new THREE.Mesh(this.own(merge(geos)), material);
		mesh.frustumCulled = false;
		return mesh;
	}

	/** A floating island: grass disc, rocky cone below, trees and rocks on top. */
	private island(rng: () => number, r: number, x: number, y: number, z: number): THREE.BufferGeometry {
		const t = this.theme;
		const grass = new THREE.Color(t.grass);
		const dirt = new THREE.Color(t.dirt);
		const rock = new THREE.Color(t.rock);
		const rockDark = rock.clone().multiplyScalar(0.55);
		const seg = 5 + Math.floor(rng() * 2);
		const parts: THREE.BufferGeometry[] = [];

		const top = dropGroups(jitter(new THREE.CylinderGeometry(r, r * 0.93, 0.55, seg), r * 0.08, rng, true), [2]);
		top.translate(0, -0.275, 0);
		paintBy(top, n => n.y > 0.5 ? grass : dirt);
		parts.push(top);

		const depth = r * (1.1 + rng() * 1.1);
		const under = dropGroups(jitter(new THREE.ConeGeometry(r * 0.93, depth, seg, 1), r * 0.14, rng, true), [2]);
		under.rotateX(Math.PI);
		under.translate(0, -0.55 - depth / 2, 0);
		paintBy(under, (_n, py) => rock.clone().lerp(rockDark, Math.min(1, (-py - 0.55) / depth)));
		parts.push(under);

		const trees = Math.floor(r * 0.3 + rng() * 1.2);
		for (let i = 0; i < trees; i++) {
			const a = rng() * Math.PI * 2;
			const dist = Math.sqrt(rng()) * r * 0.72;
			parts.push(this.tree(rng, Math.cos(a) * dist, Math.sin(a) * dist, 0.7 + rng() * 0.6));
		}
		const rocks = rng() < 0.4 ? 1 : 0;
		for (let i = 0; i < rocks; i++) {
			const a = rng() * Math.PI * 2;
			const dist = (0.4 + rng() * 0.45) * r;
			const s = 0.25 + rng() * 0.35;
			const g = new THREE.OctahedronGeometry(s, 0);
			g.scale(1, 0.7, 1);
			g.translate(Math.cos(a) * dist, s * 0.35, Math.sin(a) * dist);
			paint(g, rock);
			parts.push(g);
		}

		const island = merge(parts);
		for (const p of parts) p.dispose();
		island.rotateY(rng() * Math.PI * 2);
		island.translate(x, y, z);
		return island;
	}

	private tree(rng: () => number, x: number, z: number, s: number): THREE.BufferGeometry {
		const t = this.theme;
		const leaves = new THREE.Color(t.leaves[Math.floor(rng() * t.leaves.length)]);
		const leavesDark = leaves.clone().multiplyScalar(0.8);
		const parts: THREE.BufferGeometry[] = [];

		const trunk = dropGroups(new THREE.CylinderGeometry(0.09, 0.14, 0.7, 3), [1, 2]);
		trunk.translate(0, 0.35, 0);
		paint(trunk, new THREE.Color(t.trunk));
		parts.push(trunk);

		if (rng() < 0.5) {
			// Pine: stacked cones.
			for (let i = 0; i < 2; i++) {
				const cone = dropGroups(new THREE.ConeGeometry(0.62 - i * 0.18, 0.85, 5), [2]);
				cone.translate(0, 0.75 + i * 0.42, 0);
				paint(cone, i % 2 ? leavesDark : leaves);
				parts.push(cone);
			}
		} else {
			// Round tree: one blob.
			const blob = new THREE.IcosahedronGeometry(0.6, 0);
			blob.translate(0, 1.05, 0);
			paint(blob, leaves);
			parts.push(blob);
		}

		const tree = merge(parts);
		for (const p of parts) p.dispose();
		tree.scale(s, s, s);
		tree.translate(x, 0, z);
		return tree;
	}

	// ------------------------------------------------------------- pillars

	/** Columns under the track, down into the sea (only where the track is solid). */
	private buildPillars(floor: Floor, half: number, dEnd: number): THREE.Mesh {
		const light = new THREE.Color(this.theme.trackSide[0]);
		const dark = new THREE.Color(this.theme.trackSide[1]).multiplyScalar(0.8);
		const geos: THREE.BufferGeometry[] = [];
		const x = half - 1.1;
		const solid = (px: number, d: number) =>
			floor.isSupported(px - 0.7, -d + 0.7) && floor.isSupported(px + 0.7, -d + 0.7)
			&& floor.isSupported(px - 0.7, -d - 0.7) && floor.isSupported(px + 0.7, -d - 0.7);
		for (let d = 6; d < dEnd - 4; d += 24) {
			for (const side of [-1, 1]) {
				const px = side * x;
				if (!solid(px, d)) continue;
				const height = -1.2 - SEA_Y + 2;
				const column = dropGroups(new THREE.CylinderGeometry(0.55, 0.75, height, 6), [1, 2]);
				column.translate(0, -1.2 - height / 2, 0);
				paintBy(column, (_n, y) => light.clone().lerp(dark, Math.min(1, (-1.2 - y) / 14)));
				column.translate(px, 0, -d);
				geos.push(column);
				const cap = new THREE.BoxGeometry(1.5, 0.35, 1.5);
				cap.translate(px, -1.2 - 0.175, -d);
				paint(cap, light);
				geos.push(cap);
			}
		}
		const material = this.own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
		if (geos.length === 0) return new THREE.Mesh();
		return new THREE.Mesh(this.own(merge(geos)), material);
	}

	// ------------------------------------------------------------- clouds

	private buildClouds(half: number, dMin: number, dMax: number): THREE.InstancedMesh {
		const rng = this.rng(3);
		const blobs: THREE.BufferGeometry[] = [];
		for (const [bx, by, bz, br] of [[0, 0, 0, 1], [0.95, -0.2, 0.1, 0.72], [-0.9, -0.25, -0.1, 0.68]]) {
			const g = new THREE.IcosahedronGeometry(br, 0);
			g.translate(bx, by, bz);
			blobs.push(g);
		}
		const geometry = this.own(merge(blobs));
		for (const b of blobs) b.dispose();
		const color = new THREE.Color(this.theme.cloud);
		const material = this.own(new THREE.MeshLambertMaterial({
			color, emissive: color, emissiveIntensity: 0.45, flatShading: true,
		}));

		const count = Math.ceil((dMax - dMin) / 26);
		for (let i = 0; i < count; i++) {
			const z = -(dMin + rng() * (dMax - dMin));
			const low = rng() < 0.6;
			const side = rng() < 0.5 ? -1 : 1;
			this.cloudData.push(low
				? { x: side * (half + 7 + rng() * 45), y: -6 - rng() * 6, z, s: 1.8 + rng() * 2.4, yaw: rng() * 6, speed: 0.3 + rng() * 0.5 }
				: { x: (rng() * 2 - 1) * 80, y: 16 + rng() * 16, z, s: 3 + rng() * 4, yaw: rng() * 6, speed: 0.5 + rng() * 0.8 });
		}
		const mesh = this.own(new THREE.InstancedMesh(geometry, material, count));
		mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		mesh.frustumCulled = false;
		return mesh;
	}
}

// ------------------------------------------------------------- geometry helpers

/** Non-indexed, position + normal + color only (so everything can be merged). */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
	const out = g.index ? g.toNonIndexed() : g;
	for (const name of Object.keys(out.attributes))
		if (name !== "position" && name !== "normal" && name !== "color" && name !== "gap") out.deleteAttribute(name);
	if (out !== g) g.dispose();
	return out;
}

/** Islands never come closer than this to the edge of the track (archers, spike balls). */
const ISLAND_MARGIN = 4;

/**
 * Tags every vertex of an island with its free space toward the track (signed
 * by side): the shader removes part of it on narrow screens (see setAspect).
 */
function withGap(g: THREE.BufferGeometry, x: number, r: number, half: number): THREE.BufferGeometry {
	const gap = Math.sign(x) * Math.max(0, Math.abs(x) - r - half - ISLAND_MARGIN);
	g.setAttribute("gap", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count).fill(gap), 1));
	return g;
}

/** Removes the faces of the given groups (hidden caps of cylinders and cones). */
function dropGroups<T extends THREE.BufferGeometry>(g: T, groups: number[]): T {
	const index = g.getIndex()!;
	const kept: number[] = [];
	for (const group of g.groups)
		if (!groups.includes(group.materialIndex ?? 0))
			for (let i = group.start; i < group.start + group.count; i++) kept.push(index.getX(i));
	g.setIndex(kept);
	g.clearGroups();
	return g;
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
	const cleaned = geos.map(clean);
	const merged = mergeGeometries(cleaned)!;
	for (const g of cleaned) if (!geos.includes(g)) g.dispose();
	return merged;
}

function paint(g: THREE.BufferGeometry, color: THREE.Color) {
	paintBy(g, () => color);
}

/** Vertex colors from the vertex normal and height. */
function paintBy(g: THREE.BufferGeometry, fn: (normal: THREE.Vector3, y: number) => THREE.Color) {
	const pos = g.getAttribute("position");
	const nor = g.getAttribute("normal");
	const colors = new Float32Array(pos.count * 3);
	const n = new THREE.Vector3();
	for (let i = 0; i < pos.count; i++) {
		n.fromBufferAttribute(nor, i);
		const c = fn(n, pos.getY(i));
		colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
	}
	g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/**
 * Moves the vertices by a pseudo-random offset that only depends on their
 * position (duplicated seam vertices move together: no cracks).
 * `keepTop`: the highest ring stays flat (the grass on top of the islands).
 */
function jitter(g: THREE.BufferGeometry, amount: number, rng: () => number, keepTop = false) {
	const pos = g.getAttribute("position");
	const seed = rng() * 1000;
	let maxY = -Infinity;
	for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
		const k = noise(x, y, z, seed);
		const flatTop = keepTop && y > maxY - 1e-4;
		pos.setXYZ(i,
			x + (k[0] - 0.5) * amount * 2,
			flatTop ? y : y + (k[1] - 0.5) * amount,
			z + (k[2] - 0.5) * amount * 2);
	}
	g.computeVertexNormals();
	return g;
}

function noise(x: number, y: number, z: number, seed: number): [number, number, number] {
	const h = (a: number) => {
		const s = Math.sin(a) * 43758.5453;
		return s - Math.floor(s);
	};
	const base = Math.round(x * 100) * 12.9898 + Math.round(y * 100) * 78.233 + Math.round(z * 100) * 37.719 + seed;
	return [h(base), h(base + 1.7), h(base + 3.1)];
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
