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
};

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

	constructor(resources: ResourceManager, skin: Pick<Skin, "color" | "hat">, private readonly capacity: number) {
		this.addModel(resources.getModel("player").scene, skin, 0);
		if (skin.hat) this.addModel(resources.getModel(skin.hat).scene, skin, HEAD_TOP);
	}

	update(players: readonly RenderedBody[], time: number) {
		const n = Math.min(players.length, this.capacity);
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
		}
		for (const mesh of this.meshes) {
			mesh.count = n;
			mesh.instanceMatrix.needsUpdate = true;
		}
	}

	dispose() {
		for (const o of this.owned) o.dispose();
		for (const m of this.meshes) m.dispose();
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
