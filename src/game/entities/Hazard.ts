import * as THREE from "three";
import { Entity } from "../Entity";
import type { Game } from "../Game";
import type { Player } from "./Player";

/** Something that kills the players touching it. */
export abstract class Hazard extends Entity {
	onPlayerHit(player: Player, game: Game) {
		const push = this.knockback(player);
		if (player.hurt(push.x, push.y, push.z)) game.markCrowdDirty();
	}

	/** Velocity given to a player killed by this hazard. */
	protected knockback(_player: Player): THREE.Vector3 {
		return new THREE.Vector3(0, 5, 0);
	}
}
