export type SaveData = {
	coins: number;
	/** Index of the next level to play (can exceed the number of levels: they loop). */
	level: number;
	owned: string[];
	skin: string;
};

const KEY = "mobrise-save";

const DEFAULT: SaveData = { coins: 0, level: 0, owned: ["blue"], skin: "blue" };

export function loadSave(): SaveData {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
	} catch {
		// Storage unavailable or corrupted: start fresh.
	}
	return { ...DEFAULT, owned: [...DEFAULT.owned] };
}

export function writeSave(save: SaveData) {
	try {
		localStorage.setItem(KEY, JSON.stringify(save));
	} catch {
		// Storage unavailable: progress is kept for this session only.
	}
}
