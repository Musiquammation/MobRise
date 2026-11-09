import { Entity } from "./Entity";
import type { Game } from "./Game";
import { Player } from "./entities/Player";
import { Hazard } from "./entities/Hazard";
import { Gate } from "./entities/Gate";
import { MysteryBox } from "./entities/MysteryBox";

type EntityConstructor<T extends Entity = Entity> = abstract new (...args: any[]) => T;

/** A collision behavior between two entity types. */
class CollisionHandler<T1 extends Entity, T2 extends Entity> {
	constructor(
		public typeA: EntityConstructor<T1>,
		public typeB: EntityConstructor<T2>,
		public perform: (e1: T1, e2: T2, game: Game) => void,
	) {}
}

const handlers: CollisionHandler<any, any>[] = [
	new CollisionHandler(Player, Hazard, (player: Player, hazard: Hazard, game) => {
		if (player.state === "run") hazard.onPlayerHit(player, game);
	}),

	new CollisionHandler(Player, Gate, (player: Player, gate: Gate, game) => {
		if (player.state === "run" && !gate.consumed) game.passGate(gate);
	}),

	new CollisionHandler(Player, MysteryBox, (player: Player, box: MysteryBox, game) => {
		if (player.state === "flying" && player.isAlive()) game.onBoxHit(box, player);
	}),
];

/** Called for every pair of entities whose hitboxes overlap. */
export function handleCollision(e1: Entity, e2: Entity, game: Game) {
	for (const handler of handlers) {
		if (e1 instanceof handler.typeA && e2 instanceof handler.typeB) {
			handler.perform(e1, e2, game);
			return;
		}
		if (e1 instanceof handler.typeB && e2 instanceof handler.typeA) {
			handler.perform(e2, e1, game);
			return;
		}
	}
}
