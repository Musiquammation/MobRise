import * as THREE from "three";
import type { LevelData } from "../data/Level";

type CannonData = LevelData["cannon"];

/** Writes the position of a box at `time` into `out`. */
export type BoxPath = (time: number, out: THREE.Vector3) => void;

/**
 * Trajectory of one "?" box of the cannon phase, depending on `cannon.path`:
 * - "ellipse" (default): every box on the same elliptic loop (rx, ry).
 * - "figure8": a horizontal 8 (rx wide, ry high). Use an odd number of boxes,
 *   otherwise two of them meet in the middle.
 * - "row": the boxes stay in a row (`spacing` apart) that swings left and
 *   right by rx, each one bobbing up and down by ry.
 * - "pendulum": the boxes are hung on a circle of radius rx around the top
 *   point, swinging (ry = max angle, in radians) one after the other, as a wave.
 * `sway` moves the whole pattern sideways (amplitude, at `swaySpeed` turns/s).
 */
export function boxPath(c: CannonData, center: THREE.Vector3, index: number): BoxPath {
	const n = c.boxes;
	const phase = index / n;
	const sway = c.sway ?? 0;
	const swaySpeed = c.swaySpeed ?? 0.1;
	const offsetX = (time: number) => sway * Math.sin(time * swaySpeed * Math.PI * 2);

	switch (c.path ?? "ellipse") {
		case "figure8":
			return (time, out) => {
				const a = (time * c.speed + phase) * Math.PI * 2;
				out.set(center.x + offsetX(time) + Math.sin(a) * c.rx, center.y + Math.sin(2 * a) * c.ry, center.z);
			};
		case "row": {
			const spacing = c.spacing ?? 2.2;
			const slot = (index - (n - 1) / 2) * spacing;
			return (time, out) => {
				const a = time * c.speed * Math.PI * 2;
				out.set(
					center.x + offsetX(time) + slot + Math.sin(a) * c.rx,
					center.y + Math.sin(a * 2 + index * 1.3) * c.ry,
					center.z,
				);
			};
		}
		case "pendulum": {
			const spacing = c.spacing ?? 2.2;
			const slot = (index - (n - 1) / 2) * spacing;
			return (time, out) => {
				// Small delay per box: they swing as a wave and never touch.
				const a = Math.sin((time * c.speed - index * 0.06) * Math.PI * 2) * c.ry;
				out.set(
					center.x + offsetX(time) + slot + Math.sin(a) * c.rx,
					center.y + c.rx / 2 - Math.cos(a) * c.rx,
					center.z,
				);
			};
		}
		default:
			return (time, out) => {
				const a = (time * c.speed + phase) * Math.PI * 2;
				out.set(center.x + offsetX(time) + Math.cos(a) * c.rx, center.y + Math.sin(a) * c.ry, center.z);
			};
	}
}

/** Half extents (x, y) of the area the boxes can reach, around the center. */
export function boxPathExtent(c: CannonData): { x: number; y: number } {
	const sway = c.sway ?? 0;
	const spacing = c.spacing ?? 2.2;
	const halfRow = ((c.boxes - 1) / 2) * spacing;
	switch (c.path ?? "ellipse") {
		case "row":
			return { x: halfRow + c.rx + sway, y: c.ry };
		case "pendulum":
			return { x: halfRow + c.rx * Math.sin(Math.min(c.ry, Math.PI / 2)) + sway, y: c.rx / 2 };
		default:
			return { x: c.rx + sway, y: c.ry };
	}
}
