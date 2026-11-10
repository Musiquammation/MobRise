/**
 * Reference locale: every other locale must provide the same keys
 * (checked by TypeScript through the `Messages` type).
 *
 * - `{name}` is replaced by the matching parameter of `t()`.
 * - Messages displayed with `x-html` may contain simple markup.
 */
const en = {
	main: {
		level: "Level {n}",
		play: "Play",
		skins: "Skins",
		levels: "Levels",
	},
	game: {
		aim: "Aim at the <b>?</b>",
		shots: "Shots {n}",
		level: "Level {n}",
		next: "Next",
		lost: "Lost",
		retry: "Retry",
	},
	shop: {
		title: "Skins",
		equipped: "Equipped",
		equip: "Equip",
		back: "Back",
	},
	/** Keyed by skin id (src/data/skins.ts). */
	skins: {
		blue: "Blue",
		red: "Red",
		green: "Green",
		cap: "Cap",
		party: "Party",
		ninja: "Ninja",
		king: "King",
	},
	/** Keyed by the `name` field of the level files (public/levels/*.json). */
	levels: {
		welcome: "Welcome!",
		firstSteps: "First steps",
		mindTheHole: "Mind the hole",
		spikeField: "Spike field",
		redTowers: "The red towers",
		bigMix: "The big mix",
	},
};

export default en;
