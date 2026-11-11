import { url } from "../env";
import type { ResourceRequest } from "./ResourceManager";

/** Models needed for every level. Priority 0 = never evicted first. */
export const CORE_MODELS: ResourceRequest[] = [
	{ id: "player", path: url("models/player.gltf"), priority: 0 },
	{ id: "gate_post", path: url("models/gate_post.gltf"), priority: 1 },
	{ id: "spike_ball", path: url("models/spike_ball.gltf"), priority: 1 },
	{ id: "cannon_base", path: url("models/cannon_base.gltf"), priority: 1 },
	{ id: "cannon_barrel", path: url("models/cannon_barrel.gltf"), priority: 1 },
	{ id: "mystery_box", path: url("models/mystery_box.gltf"), priority: 1 },
	{ id: "coin", path: url("models/coin.gltf"), priority: 1 },
];

/** Hats, only needed by the skins that use them. */
export const HAT_MODELS: ResourceRequest[] = [
	{ id: "hat_cap", path: url("models/hat_cap.gltf"), priority: 2 },
	{ id: "hat_crown", path: url("models/hat_crown.gltf"), priority: 2 },
	{ id: "hat_party", path: url("models/hat_party.gltf"), priority: 2 },
	{ id: "hat_band", path: url("models/hat_band.gltf"), priority: 2 },
	{ id: "hat_wizard", path: url("models/hat_wizard.gltf"), priority: 2 },
	{ id: "hat_viking", path: url("models/hat_viking.gltf"), priority: 2 },
	{ id: "hat_halo", path: url("models/hat_halo.gltf"), priority: 2 },
];

export const LEVEL_INDEX: ResourceRequest = { id: "levels", path: url("levels/index.json"), priority: 0 };

export function levelRequest(file: string): ResourceRequest {
	return { id: `level:${file}`, path: url(`levels/${file}`), priority: 3 };
}
