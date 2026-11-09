import type { ResourceRequest } from "./ResourceManager";

/** Models needed for every level. Priority 0 = never evicted first. */
export const CORE_MODELS: ResourceRequest[] = [
	{ id: "player", path: "/models/player.gltf", priority: 0 },
	{ id: "gate_post", path: "/models/gate_post.gltf", priority: 1 },
	{ id: "arrow", path: "/models/arrow.gltf", priority: 1 },
	{ id: "cannon_base", path: "/models/cannon_base.gltf", priority: 1 },
	{ id: "cannon_barrel", path: "/models/cannon_barrel.gltf", priority: 1 },
	{ id: "mystery_box", path: "/models/mystery_box.gltf", priority: 1 },
	{ id: "coin", path: "/models/coin.gltf", priority: 1 },
];

/** Hats, only needed by the skins that use them. */
export const HAT_MODELS: ResourceRequest[] = [
	{ id: "hat_cap", path: "/models/hat_cap.gltf", priority: 2 },
	{ id: "hat_crown", path: "/models/hat_crown.gltf", priority: 2 },
	{ id: "hat_party", path: "/models/hat_party.gltf", priority: 2 },
	{ id: "hat_band", path: "/models/hat_band.gltf", priority: 2 },
];

export const LEVEL_INDEX: ResourceRequest = { id: "levels", path: "/levels/index.json", priority: 0 };

export function levelRequest(file: string): ResourceRequest {
	return { id: `level:${file}`, path: `/levels/${file}`, priority: 3 };
}
