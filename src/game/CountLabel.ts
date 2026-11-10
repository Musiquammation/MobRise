import * as THREE from "three";

/** Rounded badge with a number, always drawn on top (enemy groups, recruits...). */
export class CountLabel {
	readonly sprite: THREE.Sprite;
	private readonly texture: THREE.CanvasTexture;
	private shown: string | null = null;

	constructor(private readonly color: string, private readonly prefix = "") {
		const canvas = document.createElement("canvas");
		canvas.width = 128;
		canvas.height = 64;
		this.texture = new THREE.CanvasTexture(canvas);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true }));
		this.sprite.scale.set(1.6, 0.8, 1);
		this.sprite.renderOrder = 10;
	}

	/** Shows `count` at (x, y, z), hidden when 0. */
	set(count: number, x: number, y: number, z: number) {
		this.sprite.visible = count > 0;
		if (count <= 0) return;
		this.sprite.position.set(x, y, z);
		const text = this.prefix + count;
		if (text === this.shown) return;
		this.shown = text;
		const ctx = (this.texture.image as HTMLCanvasElement).getContext("2d")!;
		ctx.clearRect(0, 0, 128, 64);
		ctx.fillStyle = this.color;
		ctx.beginPath();
		ctx.roundRect(8, 6, 112, 52, 18);
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.font = `bold ${text.length > 3 ? 34 : 40}px system-ui, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(text, 64, 34);
		this.texture.needsUpdate = true;
	}

	dispose() {
		this.texture.dispose();
		this.sprite.material.dispose();
	}
}
