import * as THREE from "three";

/** Smoothly follows a target position while looking at a target point. */
export class Camera {
	readonly camera: THREE.PerspectiveCamera;

	private readonly position = new THREE.Vector3();
	private readonly look = new THREE.Vector3();

	/** Higher = faster transitions. */
	sharpness = 4;

	constructor(aspect: number) {
		this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 300);
	}

	get(): THREE.PerspectiveCamera {
		return this.camera;
	}

	setAspect(aspect: number) {
		this.camera.aspect = aspect;
		this.camera.updateProjectionMatrix();
	}

	/** Teleports the camera, cutting any ongoing transition. */
	snap(position: THREE.Vector3, look: THREE.Vector3) {
		this.position.copy(position);
		this.look.copy(look);
		this.apply();
	}

	/** Moves toward the given position / look-at point. */
	follow(position: THREE.Vector3, look: THREE.Vector3, dt: number) {
		const k = 1 - Math.exp(-this.sharpness * dt);
		this.position.lerp(position, k);
		this.look.lerp(look, k);
		this.apply();
	}

	private apply() {
		this.camera.position.copy(this.position);
		this.camera.lookAt(this.look);
	}
}
