import type { Entity } from "./Entity";
import type { Player } from "./entities/Player";
import type { Hazard } from "./entities/Hazard";
import type { Platform } from "./entities/Platform";
import type { Gate } from "./entities/Gate";
import type { MysteryBox } from "./entities/MysteryBox";
import type { Cannon } from "./entities/Cannon";
import type { JumpPad } from "./entities/JumpPad";
import type { Enemy } from "./entities/enemies/Enemy";
import type { Boss } from "./entities/enemies/Boss";
import type { SpeedPad } from "./entities/SpeedPad";
import type { Recruit } from "./entities/Recruit";

/** Every list of the container and the type of entity it holds. */
export type EntityLists = {
	platform: Platform;
	pad: JumpPad;
	boost: SpeedPad;
	gate: Gate;
	hazard: Hazard;
	/** Entities without collisions (archers, their arrows...). */
	prop: Entity;
	enemy: Enemy;
	boss: Boss;
	recruit: Recruit;
	cannon: Cannon;
	box: MysteryBox;
	player: Player;
};

export type EntityKey = keyof EntityLists;

/** Iteration order (also the frame order). */
const ORDER: EntityKey[] = [
	"platform", "pad", "boost", "gate", "hazard", "prop", "enemy", "boss", "recruit", "cannon", "box", "player",
];

export class EntityContainer {
	private lists: { [K in EntityKey]: EntityLists[K][] } = {
		platform: [], pad: [], boost: [], gate: [], hazard: [], prop: [], enemy: [], boss: [], recruit: [],
		cannon: [], box: [], player: [],
	};

	constructor(
		private readonly callbacks: {
			onCreate: (entity: Entity) => void;
			onDelete: (entity: Entity) => void;
		},
	) {}

	add<K extends EntityKey>(key: K, entity: EntityLists[K]) {
		this.lists[key].push(entity);
		this.callbacks.onCreate(entity);
	}

	get<K extends EntityKey>(key: K): readonly EntityLists[K][] {
		return this.lists[key];
	}

	*iterate(): Generator<Entity> {
		for (const key of ORDER)
			yield* this.lists[key];
	}

	/** Removes every entity flagged as dead. Returns how many players died. */
	removeDeads(): number {
		let deadPlayers = 0;
		for (const key of ORDER) {
			const list = this.lists[key] as Entity[];
			let w = 0;
			for (const e of list) {
				if (e.isAlive()) {
					list[w++] = e;
				} else {
					if (key === "player") deadPlayers++;
					this.callbacks.onDelete(e);
				}
			}
			list.length = w;
		}
		return deadPlayers;
	}

	clear() {
		for (const key of ORDER) {
			for (const e of this.lists[key]) this.callbacks.onDelete(e);
			this.lists[key] = [];
		}
	}
}
