import * as THREE from "three";
import { Camera } from "./Camera";
import type { InputHandler } from "./InputHandler";

/** Scene, camera and rendering. The Game builds the gameplay on top of it. */
export abstract class GameLayer {
	readonly camera: Camera;
	protected readonly scene = new THREE.Scene();

	constructor(
		protected readonly renderer: THREE.WebGLRenderer,
		protected readonly input: InputHandler,
	) {
		const size = renderer.getSize(new THREE.Vector2());
		this.camera = new Camera(size.x / size.y);

		this.scene.background = new THREE.Color("#8fd0f7");
		this.scene.fog = new THREE.Fog("#8fd0f7", 45, 130);

		this.scene.add(new THREE.HemisphereLight("#ffffff", "#7b8aa6", 1.8));
		const sun = new THREE.DirectionalLight("#ffffff", 1.6);
		sun.position.set(6, 12, 4);
		this.scene.add(sun);
		// Front light: lights the faces looking at the camera (the "?" boxes).
		const fill = new THREE.DirectionalLight("#fff4e0", 1.1);
		fill.position.set(-3, 5, 10);
		this.scene.add(fill);
	}

	/** Advances the game by dt seconds and renders it. */
	step(dt: number) {
		this.gameFrame(dt);
		this.gameUpdate(dt);
		this.render();
	}

	/** Draws the scene as it is, without advancing it (pause). */
	render() {
		this.renderer.render(this.scene, this.camera.get());
	}

	resize(width: number, height: number) {
		this.camera.setAspect(width / height);
	}

	protected abstract gameFrame(dt: number): void;
	protected abstract gameUpdate(dt: number): void;
	abstract dispose(): void;
}
