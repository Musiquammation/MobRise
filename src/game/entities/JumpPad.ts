import * as THREE from "three";
import { Entity } from "../Entity";
import type { Game } from "../Game";

const DEPTH = 1.6;
const HEIGHT = 0.35;

/** Ramp that throws the players touching it in the air (to jump over holes and hazards). */
export class JumpPad extends Entity {
	private readonly object = new THREE.Group();
	private readonly disposables: { dispose(): void }[] = [];
	private readonly arrows: THREE.MeshBasicMaterial;

	constructor(x: number, z: number, width: number, readonly power: number) {
		super();
		// z = start of the pad (distance). The ramp rises toward the end.
		this.position.set(x, 0, -z - DEPTH / 2);
		this.hitboxHalf.set(width / 2, 0.3, DEPTH / 2);
		this.hitboxOffset.set(0, 0.3, 0);

		// Wedge: triangle profile (in z/y) extruded along x.
		const shape = new THREE.Shape();
		// Shape x maps to world -z after the rotation: high side = far side.
		shape.moveTo(-DEPTH / 2, 0);
		shape.lineTo(DEPTH / 2, 0);
		shape.lineTo(DEPTH / 2, HEIGHT);
		shape.lineTo(-DEPTH / 2, 0);
		const wedge = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
		wedge.rotateY(Math.PI / 2);
		wedge.translate(-width / 2, 0, 0);
		const wedgeMat = new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.6 });
		this.disposables.push(wedge, wedgeMat);
		this.object.add(new THREE.Mesh(wedge, wedgeMat));

		// Chevrons on the slope.
		const canvas = document.createElement("canvas");
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext("2d")!;
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 9;
		ctx.lineJoin = "round";
		for (const y of [22, 46]) {
			ctx.beginPath();
			ctx.moveTo(12, y + 10);
			ctx.lineTo(32, y - 8);
			ctx.lineTo(52, y + 10);
			ctx.stroke();
		}
		const texture = new THREE.CanvasTexture(canvas);
		texture.wrapS = THREE.RepeatWrapping;
		texture.repeat.set(Math.max(1, Math.round(width / 1.2)), 1);
		texture.colorSpace = THREE.SRGBColorSpace;
		this.arrows = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
		const slope = Math.hypot(DEPTH, HEIGHT);
		const plane = new THREE.PlaneGeometry(width * 0.92, slope * 0.9);
		this.disposables.push(texture, this.arrows, plane);
		const chevrons = new THREE.Mesh(plane, this.arrows);
		chevrons.rotation.x = -Math.PI / 2 + Math.atan2(HEIGHT, DEPTH);
		chevrons.position.set(0, HEIGHT / 2 + 0.01, 0);
		this.object.add(chevrons);
	}

	getObject() {
		return this.object;
	}

	frame(game: Game) {
		this.arrows.opacity = 0.6 + Math.sin(game.time * 8) * 0.4;
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}
}
