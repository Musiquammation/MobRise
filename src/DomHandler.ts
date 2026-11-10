import Alpine from "alpinejs";
import type { Skin } from "./data/skins";
import type { GamePhase } from "./game/Game";
import { t } from "./i18n";

export type PanelSymbol = "loading" | "main" | "game" | "shop";

export class LoadingComponent {
	readonly panel = "loading" as const;
	/** In [0, 1]. */
	progress = 0;
}

export class MainComponent {
	readonly panel = "main" as const;
	constructor(
		public levelNumber: number,
		public levelName: string,
	) {}
}

export class GameComponent {
	readonly panel = "game" as const;
	phase: GamePhase = "run";
	/** Players in the crowd (or left to shoot during the cannon phase). */
	count = 0;
	/** Distance done, in [0, 1]. */
	progress = 0;
	combo = 0;
	/** Last coin gain, and a key that changes on every gain (restarts the animation). */
	gain = 0;
	gainKey = 0;
	/** Change of the crowd at the last gate, and a key that changes on every gate. */
	gateDelta = 0;
	gateKey = 0;
	/** Coins earned during this level (with the skin bonus once won). */
	earned = 0;
	/** Coin multiplier of the skin, applied when the level is won (1 = none). */
	multiplier = 1;
	/** Screen position of the crowd counter. */
	bubble = { x: 0, y: 0, visible: false };
	/** Screen position of the cannon crosshair. */
	aim = { x: 0, y: 0, visible: false };

	constructor(public levelNumber: number) {}
}

/** One line of the stats panel of a skin. */
export type ShopStat = {
	/** Key of `shop.stats` / `shop.hints` in the locales. */
	id: "flight" | "shield" | "speed" | "coins";
	/** In [0, 100]: length of the bar. */
	level: number;
	/** What it does in game ("0.6 s", "45 %"...). */
	value: string;
};

export type ShopItem = {
	skin: Skin;
	thumbnail: string;
	owned: boolean;
	equipped: boolean;
	stats: ShopStat[];
	/** Average of the stats, in [0, 100]. */
	power: number;
};

export class ShopComponent {
	readonly panel = "shop" as const;
	/** Skin whose stats are shown in the side panel. */
	selected: string | null = null;
	constructor(public items: ShopItem[]) {}

	get selectedItem(): ShopItem | null {
		return this.items.find(i => i.skin.id === this.selected) ?? null;
	}
}

export type Panel = LoadingComponent | MainComponent | GameComponent | ShopComponent;

/** What the buttons of the interface trigger (implemented by App). */
export interface DomActions {
	play(): void;
	openShop(): void;
	closeShop(): void;
	buy(skinId: string): void;
	equip(skinId: string): void;
	next(): void;
	retry(): void;
}

// Kept outside the reactive store: Alpine would otherwise wrap the whole
// game (three.js objects included) in reactive proxies.
let actions: DomActions | null = null;

/**
 * State of the HTML interface, exposed to Alpine as `$store.dom`.
 * Only plain data lives here.
 */
export class DomHandler {
	panel: Panel = new LoadingComponent();
	coins = 0;

	is(symbol: PanelSymbol): boolean {
		return this.panel.panel === symbol;
	}

	/**
	 * Replaces the panel and returns its reactive version: always write
	 * through the returned object so that the page updates.
	 */
	show<P extends Panel>(panel: P): P {
		this.panel = panel;
		return this.panel as P;
	}

	play() { actions?.play(); }
	openShop() { actions?.openShop(); }
	closeShop() { actions?.closeShop(); }
	buy(id: string) { actions?.buy(id); }
	equip(id: string) { actions?.equip(id); }
	next() { actions?.next(); }
	retry() { actions?.retry(); }
}

/** Registers the DomHandler in Alpine, starts Alpine and returns the reactive handler. */
export function createDomHandler(bound: DomActions): DomHandler {
	actions = bound;
	(window as unknown as { Alpine: typeof Alpine }).Alpine = Alpine; // handy for debugging
	// `$t(key, params)` in the templates (see src/i18n).
	Alpine.magic("t", () => t);
	Alpine.store("dom", new DomHandler());
	Alpine.start();
	return Alpine.store("dom") as DomHandler;
}
