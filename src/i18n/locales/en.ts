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
		pause: "Pause",
		paused: "Paused",
		resume: "Resume",
		quit: "Menu",
	},
	settings: {
		title: "Settings",
		music: "Music",
		sounds: "Sounds",
		ok: "OK",
		credits: "Music: “Riverside Ride” by Matthew Pablo (CC-BY 3.0) · Other music and sounds: OpenGameArt and Kenney (CC0)",
	},
	shop: {
		title: "Skins",
		equipped: "Equipped",
		equip: "Equip",
		back: "Back",
		close: "Close",
		stats: {
			flight: "Flight",
			shield: "Shield",
			speed: "Speed",
			coins: "Coins",
		},
		hints: {
			flight: "Jumps by itself when the ground ends, higher and further.",
			shield: "Chance for each runner to get a shield that blocks one hit.",
			speed: "Runs and dodges faster.",
			coins: "Multiplies the coins earned when the level is won.",
		},
		power: "Average",
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
		wizard: "Wizard",
		viking: "Viking",
		angel: "Angel",
	},
	/** Keyed by the `name` field of the level files (public/levels/*.json). */
	levels: {
		welcome: "Welcome!",
		firstSteps: "First steps",
		mindTheHole: "Mind the hole",
		spikeField: "Spike field",
		redTowers: "The red towers",
		bigMix: "The big mix",
		purpleGates: "Purple gates",
		windyRoad: "Windy road",
		speedRamp: "Speed ramp",
		storm: "The storm",
		leapfrog: "Leapfrog",
		fullSpeed: "Full speed",
		joinUs: "Join us!",
		bridges: "Narrow bridges",
		spikeIntro: "Sharp start",
		slowBlink: "Up and down",
		spikeDance: "Spike dance",
		firstArchers: "First archers",
		archerAlley: "Archer alley",
		crossfire: "Crossfire",
		bossIntro: "The first giant",
		giantPath: "Giant's path",
		breeze: "Light breeze",
		firstJumps: "First jumps",
		buttonIntro: "The button",
		leftRight: "Left, right",
		spikedLog: "The spiked log",
		quickPress: "Quick, press!",
		brickWall: "Brick wall",
		windmill: "Windmill",
		chicane: "Chicane",
		demolition: "Demolition",
		gears: "Gears",
		rhythm: "Rhythm",
		grandFinale: "Grand finale",
	},
};

export default en;
