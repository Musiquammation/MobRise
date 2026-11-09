import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Platform } from "../Platform";
import type { LevelData } from "../../../data/Level";

const THICKNESS = 1.2;
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

	constructor(level: LevelData) {
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
	 * Splits the floor into a grid along every hole edge (and every BAND for
	 * the stripes), drops the cells inside holes, merges the remaining cells
	 * of each row and builds one geometry out of them.
	 */
	private buildTrack(): THREE.Mesh {
		const xs = new Set([-this.half, this.half]);
		const ds = new Set([this.dStart, this.dEnd]);
		for (let d = 0; d < this.dEnd; d += BAND) ds.add(d);
		for (const h of this.holes) {
			xs.add(h.x0); xs.add(h.x1);
			ds.add(h.d0); ds.add(h.d1);
		}
		const sx = [...xs].sort((a, b) => a - b);
		const sd = [...ds].filter(d => d >= this.dStart && d <= this.dEnd).sort((a, b) => a - b);

		const light = new THREE.Color("#f1f5fb");
		const lighter = new THREE.Color("#dfe7f2");
		const side = new THREE.Color("#7d8ba3");

		const geos: THREE.BufferGeometry[] = [];
		for (let j = 0; j < sd.length - 1; j++) {
			const d0 = sd[j], d1 = sd[j + 1];
			const dm = (d0 + d1) / 2;
			const top = Math.floor(dm / BAND) % 2 === 0 ? light : lighter;

			let runStart: number | null = null;
			for (let i = 0; i <= sx.length - 1; i++) {
				const solid = i < sx.length - 1 && !this.holes.some(h => {
					const xm = (sx[i] + sx[i + 1]) / 2;
					return xm > h.x0 && xm < h.x1 && dm > h.d0 && dm < h.d1;
				});
				if (solid && runStart === null) runStart = sx[i];
				if (!solid && runStart !== null) {
					geos.push(cell(runStart, sx[i], d0, d1, top, side));
					runStart = null;
				}
			}
		}

		const geometry = mergeGeometries(geos)!;
		for (const g of geos) g.dispose();
		const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
		this.disposables.push(geometry, material);
		return new THREE.Mesh(geometry, material);
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
		return mesh;
	}
}

/** One box of the floor, colored with vertex colors (top / sides). */
function cell(x0: number, x1: number, d0: number, d1: number, top: THREE.Color, side: THREE.Color) {
	const g = new THREE.BoxGeometry(x1 - x0, THICKNESS, d1 - d0);
	g.translate((x0 + x1) / 2, -THICKNESS / 2, -(d0 + d1) / 2);
	const normals = g.getAttribute("normal");
	const colors = new Float32Array(normals.count * 3);
	for (let i = 0; i < normals.count; i++) {
		const c = normals.getY(i) > 0.5 ? top : side;
		colors.set([c.r, c.g, c.b], i * 3);
	}
	g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	return g;
}
