import * as THREE from "three";
import { createResourceManager, type ResourceRequest } from "./resources/ResourceManager";
import { CORE_MODELS, HAT_MODELS, LEVEL_INDEX, levelRequest } from "./resources/assets";
import {
	createDomHandler, DomHandler, GameComponent, LoadingComponent, MainComponent, ShopComponent,
	type DomActions,
} from "./DomHandler";
import { Game, roundTenth } from "./game/Game";
import { InputHandler } from "./game/InputHandler";
import { renderSkinThumbnails } from "./game/skinThumbnails";
import { loadSave, writeSave, type SaveData } from "./data/save";
import { getSkin, SKINS } from "./data/skins";
import type { LevelData, LevelIndex } from "./data/Level";

export class App implements DomActions {
	private readonly resources = createResourceManager(32 * 1024 * 1024);
	private readonly input = new InputHandler();
	private readonly renderer: THREE.WebGLRenderer;
	private readonly dom: DomHandler;
	private readonly save: SaveData = loadSave();

	private levels: LevelIndex = [];
	private levelResource: string | null = null;
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
	}

	async boot() {
		await this.loadWithScreen([...CORE_MODELS, ...HAT_MODELS, LEVEL_INDEX], "Chargement des modèles…");
		this.levels = this.resources.getJson<LevelIndex>("levels");
		this.thumbnails = renderSkinThumbnails(this.resources, SKINS);
		await this.openLevel();
		requestAnimationFrame(t => this.loop(t));
	}

	/** Loads resources while the loading panel shows the progress. */
	private async loadWithScreen(requests: ResourceRequest[], label: string) {
		const screen = this.dom.show(new LoadingComponent());
		screen.label = label;
		await this.resources.load(requests, (loaded, total) => {
			screen.progress = total ? loaded / total : 1;
		});
	}

	/** Loads the current level and shows the main menu in front of it. */
	private async openLevel() {
		const file = this.levels[this.save.level % this.levels.length];
		const request = levelRequest(file);

		if (this.levelResource !== request.id) {
			await this.loadWithScreen([request], "Chargement du niveau…");
			if (this.levelResource) this.resources.release([this.levelResource]);
			this.levelResource = request.id;
		}

		this.buildGame();
		const level = this.resources.getJson<LevelData>(request.id);
		this.dom.show(new MainComponent(this.save.level + 1, level.name));
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
						this.save.level++;
						writeSave(this.save);
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
		}));
	}

	// ------------------------------------------------------------- DomActions

	play() {
		if (!this.game || this.game.phase !== "idle") return;
		const ui = this.dom.show(new GameComponent(this.save.level + 1));
		this.game.start(ui);
	}

	openShop() {
		this.dom.show(new ShopComponent(this.shopItems()));
	}

	closeShop() {
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
