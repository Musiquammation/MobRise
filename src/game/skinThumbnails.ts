import * as THREE from "three";
import { PlayerRenderer } from "./PlayerRenderer";
import { Player } from "./entities/Player";
import type { ResourceManager } from "../resources/ResourceManager";
import type { Skin } from "../data/skins";

/** Renders a small picture of each skin (for the shop). Returns id -> data URL. */
export function renderSkinThumbnails(resources: ResourceManager, skins: Skin[], size = 160): Record<string, string> {
	const canvas = document.createElement("canvas");
	const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
	renderer.setSize(size, size, false);

	const scene = new THREE.Scene();
	scene.add(new THREE.HemisphereLight("#ffffff", "#7b8aa6", 2));
	const sun = new THREE.DirectionalLight("#ffffff", 1.5);
	sun.position.set(-2, 4, -5);
	scene.add(sun);

	// The model faces -Z: look at it from the front, slightly from above.
	const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
	camera.position.set(-1.1, 1.5, -2.6);
	camera.lookAt(0, 0.62, 0);

	const player = new Player(0, 0, 0);
	player.yaw = 0.25;

	const out: Record<string, string> = {};
	for (const skin of skins) {
		const pr = new PlayerRenderer(resources, skin, 1);
		pr.update([player], 0);
		scene.add(pr.group);
		renderer.render(scene, camera);
		out[skin.id] = canvas.toDataURL("image/png");
		scene.remove(pr.group);
		pr.dispose();
	}

	renderer.dispose();
	renderer.forceContextLoss();
	return out;
}
