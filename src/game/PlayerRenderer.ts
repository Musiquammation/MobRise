import * as THREE from "three";
import type { ResourceManager } from "../resources/ResourceManager";
import type { Skin } from "../data/skins";

/** What the renderer needs to draw a character (players and enemies). */
export type RenderedBody = {
	readonly position: THREE.Vector3;
	readonly state: string;
	readonly animPhase: number;
	readonly yaw: number;
	readonly spin: number;
	readonly scale: number;
	/** Draws a bubble around the body (skin ability). */
	readonly shield?: boolean;
};

const bubbleGeometry = new THREE.IcosahedronGeometry(0.62, 2).translate(0, 0.55, 0);
const bubbleMaterial = new THREE.MeshStandardMaterial({
	color: "#7dd3fc", emissive: "#38bdf8", emissiveIntensity: 0.35,
	transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.1,
});

/** Soft round shadow drawn under each body standing on the ground. */
const shadowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
let shadowMaterial: THREE.MeshBasicMaterial | null = null;
function getShadowMaterial() {
	if (shadowMaterial) return shadowMaterial;
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 64;
	const ctx = canvas.getContext("2d")!;
	const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
	gradient.addColorStop(0, "rgba(20,30,60,0.55)");
	gradient.addColorStop(0.55, "rgba(20,30,60,0.32)");
	gradient.addColorStop(1, "rgba(20,30,60,0)");
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 64, 64);
	const texture = new THREE.CanvasTexture(canvas);
	shadowMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, fog: true });
	return shadowMaterial;
}
const SHADOW_Y = 0.025;
const SHADOW_SIZE = 0.95;
/** Height at which the shadow has vanished. */
const SHADOW_FADE = 5;

/** Height of the top of the player's head (hats are placed there). */
const HEAD_TOP = 1.07;

const matrix = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, "YXZ");
const pos = new THREE.Vector3();
const scale = new THREE.Vector3(1, 1, 1);

/**
 * Draws every player with instancing: one InstancedMesh per part of the model
 * (body, eyes, hat...), so hundreds of players cost a handful of draw calls.
 */
export class PlayerRenderer {
	readonly group = new THREE.Group();
	private readonly meshes: THREE.InstancedMesh[] = [];
	private readonly owned: { dispose(): void }[] = [];
	/** Shield bubbles, only drawn for the bodies that have one. */
	private readonly bubbles: THREE.InstancedMesh;
	private readonly shadows: THREE.InstancedMesh;

	constructor(resources: ResourceManager, skin: Pick<Skin, "color" | "hat">, private readonly capacity: number) {
		this.shadows = new THREE.InstancedMesh(shadowGeometry, getShadowMaterial(), capacity);
		this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.shadows.frustumCulled = false;
		this.shadows.count = 0;
		this.shadows.renderOrder = -1;
		this.group.add(this.shadows);
		this.addModel(resources.getModel("player").scene, skin, 0);
		if (skin.hat) this.addModel(resources.getModel(skin.hat).scene, skin, HEAD_TOP);
		this.bubbles = new THREE.InstancedMesh(bubbleGeometry, bubbleMaterial, capacity);
		this.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.bubbles.frustumCulled = false;
		this.bubbles.count = 0;
		this.bubbles.renderOrder = 1;
		this.group.add(this.bubbles);
	}

	/** `ground(x, z)`: whether there is floor there (draws the shadows; none without it). */
	update(players: readonly RenderedBody[], time: number, ground?: (x: number, z: number) => boolean) {
		const n = Math.min(players.length, this.capacity);
		let shields = 0, shadows = 0;
		for (let i = 0; i < n; i++) {
			const p = players[i];
			let bob = 0, sway = 0;
			if (p.state === "run" || p.state === "gather") {
				const t = time * 14 + p.animPhase;
				bob = Math.abs(Math.sin(t)) * 0.08;
				sway = Math.sin(t) * 0.12;
			}
			euler.set(p.spin, p.yaw, sway);
			quat.setFromEuler(euler);
			pos.set(p.position.x, p.position.y + bob, p.position.z);
			scale.setScalar(p.scale);
			matrix.compose(pos, quat, scale);
			for (const mesh of this.meshes) mesh.setMatrixAt(i, matrix);
			if (p.shield) {
				// Upright, without the tumble.
				quat.identity();
				matrix.compose(pos, quat, scale);
				this.bubbles.setMatrixAt(shields++, matrix);
			}
			if (ground && p.position.y > -0.1 && p.position.y < SHADOW_FADE && ground(p.position.x, p.position.z)) {
				const size = SHADOW_SIZE * p.scale * (1 - p.position.y / SHADOW_FADE * 0.6);
				quat.identity();
				pos.set(p.position.x, SHADOW_Y, p.position.z);
				scale.set(size, 1, size);
				matrix.compose(pos, quat, scale);
				this.shadows.setMatrixAt(shadows++, matrix);
			}
		}
		this.shadows.count = shadows;
		this.shadows.instanceMatrix.needsUpdate = true;
		this.bubbles.count = shields;
		this.bubbles.instanceMatrix.needsUpdate = true;
		for (const mesh of this.meshes) {
			mesh.count = n;
			mesh.instanceMatrix.needsUpdate = true;
		}
	}

	dispose() {
		for (const o of this.owned) o.dispose();
		for (const m of this.meshes) m.dispose();
		this.bubbles.dispose();
		this.shadows.dispose();
	}

	private addModel(scene: THREE.Object3D, skin: Pick<Skin, "color" | "hat">, offsetY: number) {
		scene.updateMatrixWorld(true);
		scene.traverse(o => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh) return;

			const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
			geometry.translate(0, offsetY, 0);
			this.owned.push(geometry);

			let material = mesh.material as THREE.MeshStandardMaterial;
			if (material.name === "skin") {
				material = material.clone();
				material.color.set(skin.color);
				this.owned.push(material);
			}

			const instanced = new THREE.InstancedMesh(geometry, material, this.capacity);
			instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			instanced.frustumCulled = false;
			instanced.count = 0;
			this.meshes.push(instanced);
			this.group.add(instanced);
		});
	}
}
