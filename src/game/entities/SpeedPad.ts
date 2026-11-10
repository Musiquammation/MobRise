import * as THREE from "three";
import { Entity } from "../Entity";
import type { Game } from "../Game";

/**
 * Boost strip on the floor: the crowd runs faster for a while after touching
 * it. Placed before a jump pad, it makes the jump longer (bigger holes).
 */
export class SpeedPad extends Entity {
	private readonly object = new THREE.Group();
	private readonly texture: THREE.CanvasTexture;
	private readonly disposables: { dispose(): void }[] = [];

	constructor(
		x: number,
		z: number,
		width: number,
		depth: number,
		/** Speed multiplier. */
		readonly factor: number,
		/** Seconds at full boost after leaving the pad. */
		readonly duration: number,
	) {
		super();
		// z = start of the pad (distance).
		this.position.set(x, 0, -z - depth / 2);
		this.hitboxHalf.set(width / 2, 0.3, depth / 2);
		this.hitboxOffset.set(0, 0.3, 0);

		const baseGeo = new THREE.BoxGeometry(width, 0.05, depth);
		const baseMat = new THREE.MeshStandardMaterial({ color: "#0e7490", roughness: 0.4, emissive: "#06b6d4", emissiveIntensity: 0.35 });
		const base = new THREE.Mesh(baseGeo, baseMat);
		base.position.y = 0.025;
		this.disposables.push(baseGeo, baseMat);
		this.object.add(base);

		// Scrolling chevrons pointing forward.
		const canvas = document.createElement("canvas");
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext("2d")!;
		ctx.strokeStyle = "#ecfeff";
		ctx.lineWidth = 10;
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(10, 46);
		ctx.lineTo(32, 18);
		ctx.lineTo(54, 46);
		ctx.stroke();
		this.texture = new THREE.CanvasTexture(canvas);
		this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
		this.texture.repeat.set(Math.max(1, Math.round(width / 1.3)), Math.max(1, Math.round(depth / 1.1)));
		this.texture.colorSpace = THREE.SRGBColorSpace;
		const arrowMat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false });
		const plane = new THREE.PlaneGeometry(width * 0.94, depth * 0.94);
		this.disposables.push(this.texture, arrowMat, plane);
		const arrows = new THREE.Mesh(plane, arrowMat);
		arrows.rotation.x = -Math.PI / 2;
		arrows.position.y = 0.055;
		this.object.add(arrows);
	}

	getObject() {
		return this.object;
	}

	frame(game: Game) {
		this.texture.offset.y = -game.time * 2.5;
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}
}
