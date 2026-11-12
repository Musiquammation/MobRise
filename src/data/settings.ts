/** Player preferences, kept apart from the progress (save.ts). */
export type Settings = {
	/** Volume of the music, in [0, 1]. */
	music: number;
	/** Volume of the sound effects, in [0, 1]. */
	sounds: number;
};

const KEY = "mobrise-settings";

const DEFAULT: Settings = { music: 0.6, sounds: 0.8 };

export function loadSettings(): Settings {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
	} catch {
		// Storage unavailable or corrupted: defaults.
	}
	return { ...DEFAULT };
}

export function writeSettings(settings: Settings) {
	try {
		localStorage.setItem(KEY, JSON.stringify(settings));
	} catch {
		// Storage unavailable: kept for this session only.
	}
}
