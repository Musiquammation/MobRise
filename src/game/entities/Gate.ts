import * as THREE from "three";
import { Entity } from "../Entity";
import type { Game } from "../Game";

const POST_HEIGHT = 2.6;

/** Changes the number of players when the crowd passes through it. */
export abstract class Gate extends Entity {
	consumed = false;
	private readonly object = new THREE.Group();
	private readonly panel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
	private fade = 1;

	constructor(
		postModel: THREE.Object3D,
		x: number,
		z: number,
		readonly width: number,
		readonly value: number,
	) {
		super();
		this.position.set(x, 0, z);
		this.hitboxHalf.set(width / 2, POST_HEIGHT / 2, 0.25);
		this.hitboxOffset.set(0, POST_HEIGHT / 2, 0);

		for (const side of [-1, 1]) {
			const post = postModel.clone();
			post.position.x = (side * width) / 2;
			this.object.add(post);
		}
		this.panel = this.buildPanel();
		this.object.add(this.panel);
	}

	/** New number of players after passing through this gate. */
	abstract apply(count: number): number;
	/** Text displayed on the gate. */
	abstract label(): string;
	/** Whether the gate increases the number of players. */
	abstract isGood(): boolean;

	getObject() {
		return this.object;
	}

	consume() {
		this.consumed = true;
	}

	frame(_game: Game, dt: number) {
		if (this.consumed && this.fade > 0) {
			this.fade = Math.max(0, this.fade - dt * 3);
			this.panel.material.opacity = 0.75 * this.fade;
			this.panel.scale.setScalar(1 + (1 - this.fade) * 0.3);
		}
	}

	dispose() {
		this.panel.geometry.dispose();
		this.panel.material.map?.dispose();
		this.panel.material.dispose();
	}

	private buildPanel() {
		const canvas = document.createElement("canvas");
		canvas.width = 256;
		canvas.height = 160;
		const ctx = canvas.getContext("2d")!;
		ctx.fillStyle = this.isGood() ? "#2f8cff" : "#ff3b4e";
		ctx.fillRect(0, 0, 256, 160);
		ctx.fillStyle = "#fff";
		ctx.font = "bold 92px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(this.label(), 128, 86);

		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		const material = new THREE.MeshBasicMaterial({
			map: texture,
			transparent: true,
			opacity: 0.75,
			side: THREE.DoubleSide,
			depthWrite: false,
		});
		const panel = new THREE.Mesh(new THREE.PlaneGeometry(this.width - 0.24, 1.7), material);
		panel.position.y = POST_HEIGHT - 0.95;
		return panel;
	}
}
