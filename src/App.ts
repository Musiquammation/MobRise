import * as THREE from "three";
import { createResourceManager, type ResourceRequest } from "./resources/ResourceManager";
import { CORE_MODELS, HAT_MODELS, LEVEL_INDEX, levelRequest } from "./resources/assets";
import {
	createDomHandler, DomHandler, GameComponent, LevelsComponent, LoadingComponent, MainComponent, ShopComponent,
	type DomActions, type ShopStat,
} from "./DomHandler";
import { Game, roundTenth } from "./game/Game";
import { InputHandler } from "./game/InputHandler";
import { renderSkinThumbnails } from "./game/skinThumbnails";
import { loadSave, writeSave, type SaveData } from "./data/save";
import { airTime, getSkin, skinAbilities, skinPower, SKINS, type Skin } from "./data/skins";
import type { LevelData, LevelIndex } from "./data/Level";
import { locale, t } from "./i18n";

/** Columns of the level grid (#levels ol in style.css). */
const LEVELS_PER_ROW = 4;

export class App implements DomActions {
	private readonly resources = createResourceManager(32 * 1024 * 1024);
	private readonly input = new InputHandler();
	private readonly renderer: THREE.WebGLRenderer;
	private readonly dom: DomHandler;
	private readonly save: SaveData = loadSave();

	private levels: LevelIndex = [];
	private levelResource: string | null = null;
	/** Index of the level shown (<= save.level: lower when replaying an old level). */
	private current = this.save.level;
	private game: Game | null = null;
	private thumbnails: Record<string, string> = {};
	private lastTime = 0;

	constructor(canvas: HTMLCanvasElement) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.resize();
		window.addEventListener("resize", () => this.resize());

		this.dom = createDomHandler(this);
		this.dom.coins = this.save.coins;
		// Dev only: lets the console (and tests) inspect the running game.
		if (import.meta.env.DEV) (window as unknown as { mobrise: unknown }).mobrise = this;
	}

	async boot() {
		await this.loadWithScreen([...CORE_MODELS, ...HAT_MODELS, LEVEL_INDEX]);
		this.levels = this.resources.getJson<LevelIndex>("levels");
		this.thumbnails = renderSkinThumbnails(this.resources, SKINS);
		await this.openLevel();
		requestAnimationFrame(t => this.loop(t));
	}

	/** Loads resources while the loading panel shows the progress. */
	private async loadWithScreen(requests: ResourceRequest[]) {
		const screen = this.dom.show(new LoadingComponent());
		await this.resources.load(requests, (loaded, total) => {
			screen.progress = total ? loaded / total : 1;
		});
	}

	/** Loads the current level and shows the main menu in front of it. */
	private async openLevel() {
		// Dev only: ?level=<file> plays public/levels/<file> (level design / tests).
		const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get("level") : null;
		const file = forced ?? this.levels[this.current % this.levels.length];
		const request = levelRequest(file);

		if (this.levelResource !== request.id) {
			await this.loadWithScreen([request]);
			if (this.levelResource) this.resources.release([this.levelResource]);
			this.levelResource = request.id;
		}

		this.buildGame();
		const level = this.resources.getJson<LevelData>(request.id);
		this.dom.show(new MainComponent(this.current + 1, levelTitle(level)));
	}

	private buildGame() {
		this.game?.dispose();
		this.input.reset();
		this.game = new Game(
			this.renderer,
			this.input,
			this.resources,
			this.resources.getJson<LevelData>(this.levelResource!),
			getSkin(this.save.skin),
			{
				onCoins: amount => this.addCoins(amount),
				onEnd: won => {
					if (won) {
						this.current++;
						if (this.current > this.save.level) {
							this.save.level = this.current;
							writeSave(this.save);
						}
					}
				},
			},
		);
		const size = this.renderer.getSize(new THREE.Vector2());
		this.game.resize(size.x, size.y);
	}

	private loop(time: number) {
		const dt = Math.min(0.05, (time - this.lastTime) / 1000 || 0);
		this.lastTime = time;
		this.game?.step(dt);
		requestAnimationFrame(t => this.loop(t));
	}

	private resize() {
		const w = window.innerWidth, h = window.innerHeight;
		this.renderer.setSize(w, h, false);
		this.game?.resize(w, h);
	}

	private addCoins(amount: number) {
		this.save.coins = roundTenth(this.save.coins + amount);
		this.dom.coins = this.save.coins;
		writeSave(this.save);
	}

	private shopItems() {
		return SKINS.map(skin => ({
			skin,
			thumbnail: this.thumbnails[skin.id] ?? "",
			owned: this.save.owned.includes(skin.id),
			equipped: this.save.skin === skin.id,
			stats: skinStats(skin),
			power: Math.round(skinPower(skin.stats)),
		}));
	}

	// ------------------------------------------------------------- DomActions

	play() {
		if (!this.game || this.game.phase !== "idle") return;
		const ui = this.dom.show(new GameComponent(this.current + 1));
		this.game.start(ui);
	}

	openShop() {
		this.dom.show(new ShopComponent(this.shopItems()));
	}

	closeShop() {
		void this.openLevel();
	}

	openLevels() {
		// Every level reached so far, plus the not yet reached ones (locked),
		// at least up to the end of the level files and of the grid row.
		const count = Math.ceil(Math.max(this.save.level + 2, this.levels.length) / LEVELS_PER_ROW) * LEVELS_PER_ROW;
		const items = Array.from({ length: count }, (_, index) => ({
			index,
			state: index < this.save.level ? "done" as const : index === this.save.level ? "current" as const : "locked" as const,
		}));
		this.dom.show(new LevelsComponent(items));
	}

	selectLevel(index: number) {
		if (index < 0 || index > this.save.level) return;
		this.current = index;
		void this.openLevel();
	}

	buy(id: string) {
		const skin = getSkin(id);
		if (this.save.owned.includes(id) || this.save.coins < skin.price) return;
		this.save.owned.push(id);
		this.addCoins(-skin.price);
		this.equip(id);
	}

	equip(id: string) {
		if (!this.save.owned.includes(id)) return;
		this.save.skin = id;
		writeSave(this.save);
		this.game?.setSkin(getSkin(id));
		const panel = this.dom.panel;
		if (panel.panel === "shop") panel.items = this.shopItems();
	}

	next() {
		void this.openLevel();
	}

	retry() {
		this.buildGame();
		this.play();
	}
}

const number = (digits: number) => new Intl.NumberFormat(locale, {
	minimumFractionDigits: digits, maximumFractionDigits: digits,
});
const seconds = number(2), whole = number(0), factor = number(1);

/** Lines of the stats panel of the shop. */
function skinStats(skin: Skin): ShopStat[] {
	const a = skinAbilities(skin.stats);
	return [
		{ id: "flight", level: skin.stats.flight, value: `${seconds.format(airTime(a))} s` },
		{ id: "shield", level: skin.stats.shield, value: `${whole.format(a.shieldChance * 100)} %` },
		{ id: "speed", level: skin.stats.speed, value: `+${whole.format((a.speed - 1) * 100)} %` },
		{ id: "coins", level: skin.stats.coins, value: `×${factor.format(a.coins)}` },
	];
}

/** Translated name of a level (its `name` is a key of `levels` in src/i18n/locales). */
function levelTitle(level: LevelData): string {
	const key = `levels.${level.name}`;
	const text = t(key);
	return text === key ? level.name : text;
}
