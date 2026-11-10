/**
 * Abilities given by a skin, each in [0, 100].
 * Each skin is a specialist (one or two strong stats), and the average of
 * its stats grows with its price.
 * See `skinAbilities` for what they mean in game.
 */
export type SkinStats = {
	/** Players jump by themselves when the ground ends (higher and longer with more flight). */
	flight: number;
	/** Chance (%) that each player gets a shield, which absorbs one hit. */
	shield: number;
	/** Run speed bonus. */
	speed: number;
	/** Multiplier of the coins earned in the level, applied when it is won. */
	coins: number;
};

export type Skin = {
	id: string;
	price: number;
	color: string;
	/** Model id of the hat, if any. */
	hat: string | null;
	stats: SkinStats;
};

/** Sorted by price: the more expensive, the higher the average of the stats. */
export const SKINS: Skin[] = [
	// average 0
	{ id: "blue", price: 0, color: "#3b82f6", hat: null, stats: { flight: 0, shield: 0, speed: 0, coins: 0 } },
	// 7.5: speed
	{ id: "red", price: 300, color: "#ef4444", hat: null, stats: { flight: 0, shield: 0, speed: 30, coins: 0 } },
	// 11.25: shield
	{ id: "green", price: 800, color: "#22c55e", hat: null, stats: { flight: 0, shield: 40, speed: 0, coins: 5 } },
	// 15: coins
	{ id: "cap", price: 1600, color: "#f59e0b", hat: "hat_cap", stats: { flight: 0, shield: 0, speed: 10, coins: 50 } },
	// 18.75: flight
	{ id: "party", price: 3000, color: "#a855f7", hat: "hat_party", stats: { flight: 60, shield: 0, speed: 0, coins: 15 } },
	// 25: speed
	{ id: "ninja", price: 5500, color: "#1f2937", hat: "hat_band", stats: { flight: 20, shield: 0, speed: 80, coins: 0 } },
	// 28.75: flight
	{ id: "wizard", price: 9000, color: "#6366f1", hat: "hat_wizard", stats: { flight: 90, shield: 25, speed: 0, coins: 0 } },
	// 32.5: shield
	{ id: "viking", price: 14000, color: "#b45309", hat: "hat_viking", stats: { flight: 0, shield: 90, speed: 40, coins: 0 } },
	// 36.25: coins
	{ id: "king", price: 22000, color: "#eab308", hat: "hat_crown", stats: { flight: 0, shield: 45, speed: 0, coins: 100 } },
	// 50: flight + shield
	{ id: "angel", price: 35000, color: "#dbeafe", hat: "hat_halo", stats: { flight: 100, shield: 70, speed: 20, coins: 10 } },
];

/** Average of the stats of a skin, in [0, 100]. */
export function skinPower(stats: SkinStats): number {
	return (stats.flight + stats.shield + stats.speed + stats.coins) / 4;
}

export function getSkin(id: string): Skin {
	return SKINS.find(s => s.id === id) ?? SKINS[0];
}

/** Vertical speed of the automatic jump when the ground ends (from flight > 0 to flight 100). */
const MIN_HOP = 2;
const MAX_HOP = 7.5;
/** Gravity of the game (see Player.ts), to compute the time in the air. */
const GRAVITY = 24;
/** Gravity reduction while airborne, at flight 100. */
const MAX_LIGHTNESS = 0.4;
/** Chance of a shield, at shield 100. */
const MAX_SHIELD = 0.45;
/** Run speed bonus, at speed 100. */
const MAX_SPEED = 0.3;
/** Coin bonus at the end of a won level, at coins 100 (×2). */
const MAX_COINS = 1;

/** What the stats of a skin do in game. */
export type SkinAbilities = {
	/** Vertical speed of the automatic jump when the ground ends (0 = none). */
	hop: number;
	/** Multiplier of the gravity during the automatic jump (not on jump pads). */
	gravity: number;
	/** Probability in [0, 1] that a new player has a shield. */
	shieldChance: number;
	/** Multiplier of the run speed. */
	speed: number;
	/** Multiplier of the coins earned in a won level. */
	coins: number;
};

export function skinAbilities(stats: SkinStats): SkinAbilities {
	return {
		hop: stats.flight > 0 ? MIN_HOP + (MAX_HOP - MIN_HOP) * stats.flight / 100 : 0,
		gravity: 1 - MAX_LIGHTNESS * stats.flight / 100,
		shieldChance: MAX_SHIELD * stats.shield / 100,
		speed: 1 + MAX_SPEED * stats.speed / 100,
		coins: 1 + MAX_COINS * stats.coins / 100,
	};
}

/** Seconds spent in the air by the automatic jump. */
export function airTime(a: SkinAbilities): number {
	return 2 * a.hop / (GRAVITY * a.gravity);
}
