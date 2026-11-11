import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Platform } from "../Platform";
import type { LevelData } from "../../../data/Level";
import type { Theme } from "../../themes";

const THICKNESS = 1.2;
/** Length of a band of the floor (the bands alternate two shades). */
const BAND = 4;
/** Floor starts this far before the start line. */
export const FLOOR_BEFORE = 8;
/** Floor continues this far after the finish line (cannon area). */
export const FLOOR_AFTER = 20;

type Rect = { x0: number; x1: number; d0: number; d1: number };

/**
 * The track. Built from the level: a rectangle with holes.
 * Works in "distance" units (d = -worldZ).
 */
export class Floor extends Platform {
	private readonly object: THREE.Group;
	private readonly holes: Rect[];
	private readonly half: number;
	private readonly dStart: number;
	private readonly dEnd: number;
	private readonly disposables: { dispose(): void }[] = [];

	constructor(level: LevelData, private readonly theme: Theme) {
		super();
		this.half = level.width / 2;
		this.dStart = -FLOOR_BEFORE;
		this.dEnd = level.length + FLOOR_AFTER;
		this.holes = level.holes.map(h => ({
			x0: Math.max(-this.half, h.x - h.width / 2),
			x1: Math.min(this.half, h.x + h.width / 2),
			d0: h.z,
			d1: h.z + h.depth,
		}));

		this.object = new THREE.Group();
		this.object.add(this.buildTrack());
		this.object.add(this.buildFinishLine(level));
	}

	getObject() {
		return this.object;
	}

	update() {}

	isSupported(x: number, z: number): boolean {
		const d = -z;
		if (x < -this.half || x > this.half || d < this.dStart || d > this.dEnd) return false;
		for (const h of this.holes)
			if (x > h.x0 && x < h.x1 && d > h.d0 && d < h.d1) return false;
		return true;
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}

	/**
	 * Splits the floor into a grid along every hole edge, drops the cells
	 * inside holes and merges the remaining cells of each row. The tops get the
	 * painted texture (bands + rims), the sides a vertex-color gradient.
	 */
	private buildTrack(): THREE.Group {
		const xs = new Set([-this.half, this.half]);
		const ds = new Set([this.dStart, this.dEnd]);
		for (const h of this.holes) {
			xs.add(h.x0); xs.add(h.x1);
			ds.add(h.d0); ds.add(h.d1);
		}
		const sx = [...xs].sort((a, b) => a - b);
		const sd = [...ds].filter(d => d >= this.dStart && d <= this.dEnd).sort((a, b) => a - b);

		const sideTop = new THREE.Color(this.theme.trackSide[0]);
		const sideBottom = new THREE.Color(this.theme.trackSide[1]);
		const tops: THREE.BufferGeometry[] = [];
		const sides: THREE.BufferGeometry[] = [];
		for (let j = 0; j < sd.length - 1; j++) {
			const d0 = sd[j], d1 = sd[j + 1];
			const dm = (d0 + d1) / 2;
			let runStart: number | null = null;
			for (let i = 0; i <= sx.length - 1; i++) {
				const solid = i < sx.length - 1 && !this.holes.some(h => {
					const xm = (sx[i] + sx[i + 1]) / 2;
					return xm > h.x0 && xm < h.x1 && dm > h.d0 && dm < h.d1;
				});
				if (solid && runStart === null) runStart = sx[i];
				if (!solid && runStart !== null) {
					tops.push(this.top(runStart, sx[i], d0, d1));
					sides.push(sideBox(runStart, sx[i], d0, d1, sideTop, sideBottom));
					runStart = null;
				}
			}
		}

		const group = new THREE.Group();
		const topGeo = mergeGeometries(tops)!;
		const sideGeo = mergeGeometries(sides)!;
		for (const g of [...tops, ...sides]) g.dispose();
		const texture = this.topTexture();
		const topMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 });
		const sideMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
		this.disposables.push(topGeo, sideGeo, texture, topMat, sideMat);
		group.add(new THREE.Mesh(topGeo, topMat), new THREE.Mesh(sideGeo, sideMat));
		return group;
	}

	/** Top face of a cell. u spans the track width, v runs along the bands. */
	private top(x0: number, x1: number, d0: number, d1: number): THREE.BufferGeometry {
		const g = new THREE.PlaneGeometry(x1 - x0, d1 - d0).rotateX(-Math.PI / 2);
		g.translate((x0 + x1) / 2, 0, -(d0 + d1) / 2);
		const pos = g.getAttribute("position");
		const uv = g.getAttribute("uv");
		for (let i = 0; i < pos.count; i++)
			uv.setXY(i, (pos.getX(i) + this.half) / (this.half * 2), -pos.getZ(i) / (BAND * 2));
		return g;
	}

	/**
	 * Texture of the top, across the whole width: two shades of bands, a soft
	 * shading near the edges, a colored rim with a light bevel and a thin line.
	 */
	private topTexture(): THREE.CanvasTexture {
		const t = this.theme;
		const W = 512, H = 128;
		const ppu = W / (this.half * 2);
		const canvas = document.createElement("canvas");
		canvas.width = W;
		canvas.height = H;
		const ctx = canvas.getContext("2d")!;
		ctx.fillStyle = t.trackA;
		ctx.fillRect(0, 0, W, H / 2);
		ctx.fillStyle = t.trackB;
		ctx.fillRect(0, H / 2, W, H / 2);

		for (const side of [0, 1]) {
			const at = (u: number) => side === 0 ? u * ppu : W - u * ppu;
			const span = (u0: number, u1: number, style: string | CanvasGradient) => {
				const a = at(u0), b = at(u1);
				ctx.fillStyle = style;
				ctx.fillRect(Math.min(a, b), 0, Math.abs(b - a), H);
			};
			// Soft shade toward the rim.
			const shade = ctx.createLinearGradient(at(1.4), 0, at(0.4), 0);
			shade.addColorStop(0, "rgba(90,60,40,0)");
			shade.addColorStop(1, "rgba(90,60,40,0.10)");
			span(0.4, 1.4, shade);
			span(0, 0.07, "rgba(255,255,255,0.85)");
			span(0.07, 0.36, t.trackRim);
			span(0.36, 0.4, "rgba(0,0,0,0.12)");
			span(0.5, 0.56, "rgba(255,255,255,0.9)");
		}
		const texture = new THREE.CanvasTexture(canvas);
		texture.wrapT = THREE.RepeatWrapping;
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 8;
		return texture;
	}

	/** Arch over the finish line: two posts and a checkered banner. */
	private buildFinishArch(level: LevelData, texture: THREE.Texture): THREE.Group {
		const group = new THREE.Group();
		const x = level.width / 2 + 0.35;
		const height = 5.2;
		const postGeo = new THREE.CylinderGeometry(0.22, 0.28, height, 10);
		postGeo.translate(0, height / 2, 0);
		const postMat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.5 });
		const ballGeo = new THREE.SphereGeometry(0.36, 14, 10);
		const ballMat = new THREE.MeshStandardMaterial({ color: this.theme.trackRim, roughness: 0.35 });
		for (const side of [-1, 1]) {
			const post = new THREE.Mesh(postGeo, postMat);
			post.position.x = side * x;
			group.add(post);
			const ball = new THREE.Mesh(ballGeo, ballMat);
			ball.position.set(side * x, height + 0.25, 0);
			group.add(ball);
		}
		const bannerTex = texture.clone();
		bannerTex.wrapS = THREE.RepeatWrapping;
		bannerTex.repeat.set(1, 1);
		bannerTex.needsUpdate = true;
		const bannerGeo = new THREE.BoxGeometry(x * 2, 0.9, 0.12);
		const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8 });
		const banner = new THREE.Mesh(bannerGeo, bannerMat);
		banner.position.y = height - 0.6;
		group.add(banner);
		this.disposables.push(postGeo, postMat, ballGeo, ballMat, bannerTex, bannerGeo, bannerMat);
		group.position.z = -level.length;
		return group;
	}

	private buildFinishLine(level: LevelData): THREE.Mesh {
		const canvas = document.createElement("canvas");
		canvas.width = 64;
		canvas.height = 8;
		const ctx = canvas.getContext("2d")!;
		for (let x = 0; x < 16; x++)
			for (let y = 0; y < 2; y++) {
				ctx.fillStyle = (x + y) % 2 ? "#111" : "#fff";
				ctx.fillRect(x * 4, y * 4, 4, 4);
			}
		const texture = new THREE.CanvasTexture(canvas);
		texture.magFilter = THREE.NearestFilter;
		texture.colorSpace = THREE.SRGBColorSpace;
		const geometry = new THREE.PlaneGeometry(level.width, 1.2);
		const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
		this.disposables.push(texture, geometry, material);

		const mesh = new THREE.Mesh(geometry, material);
		mesh.rotation.x = -Math.PI / 2;
		mesh.position.set(0, 0.01, -level.length);
		this.object.add(this.buildFinishArch(level, texture));
		return mesh;
	}
}

/** Box of a cell without its top face, vertex colors: gradient from top to bottom. */
function sideBox(x0: number, x1: number, d0: number, d1: number, top: THREE.Color, bottom: THREE.Color) {
	const g = new THREE.BoxGeometry(x1 - x0, THICKNESS, d1 - d0);
	g.translate((x0 + x1) / 2, -THICKNESS / 2, -(d0 + d1) / 2);
	// Groups: +x, -x, +y, -y, +z, -z. Drop +y (drawn by the textured top).
	const index = g.getIndex()!;
	const kept: number[] = [];
	for (const group of g.groups)
		if (group.materialIndex !== 2)
			for (let i = group.start; i < group.start + group.count; i++) kept.push(index.getX(i));
	g.setIndex(kept);
	g.clearGroups();
	g.deleteAttribute("uv");
	const pos = g.getAttribute("position");
	const colors = new Float32Array(pos.count * 3);
	const c = new THREE.Color();
	for (let i = 0; i < pos.count; i++) {
		c.copy(top).lerp(bottom, Math.min(1, -pos.getY(i) / THICKNESS));
		colors.set([c.r, c.g, c.b], i * 3);
	}
	g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	return g;
}
