import type { LevelData } from "../data/Level";

/** Colors of a level: sky, scenery and track. */
export type Theme = {
	skyTop: string;
	skyHorizon: string;
	/** Direction of the sun (toward it). */
	sunDir: [number, number, number];
	sunGlow: string;
	hemiSky: string;
	hemiGround: string;
	sunLight: string;
	sea: string;
	grass: string;
	dirt: string;
	rock: string;
	trunk: string;
	leaves: string[];
	cloud: string;
	mountain: string;
	snow: string;
	/** Track: alternating bands on top, colored rim, sides (top -> bottom). */
	trackA: string;
	trackB: string;
	trackRim: string;
	trackSide: [string, string];
};

const THEMES: Theme[] = [
	{ // Sunny day
		skyTop: "#2f8fe8", skyHorizon: "#bfe6fb", sunDir: [0.45, 0.35, -0.82], sunGlow: "#fff6d8",
		hemiSky: "#ffffff", hemiGround: "#7b8aa6", sunLight: "#ffffff",
		sea: "#1f9fd6", grass: "#74c94f", dirt: "#9a6a43", rock: "#9aa0b8", trunk: "#7a4b2a",
		leaves: ["#3fa34d", "#5cbf4a", "#2f8f4e", "#86d35a"], cloud: "#ffffff",
		mountain: "#8fb6dc", snow: "#f4f8ff",
		trackA: "#fdf8ef", trackB: "#f3ead9", trackRim: "#ff9f1c", trackSide: ["#ecd8b6", "#9c7652"],
	},
	{ // Sunset, autumn trees
		skyTop: "#4a58b8", skyHorizon: "#ffc9a3", sunDir: [-0.5, 0.12, -0.86], sunGlow: "#ffe2a8",
		hemiSky: "#fff0e2", hemiGround: "#8a7aa6", sunLight: "#ffe0bd",
		sea: "#5b6cc4", grass: "#a8c75a", dirt: "#8a5a4b", rock: "#a58ea0", trunk: "#6b3f2a",
		leaves: ["#ef8a3a", "#f5b83d", "#dd5b3c", "#f29f4b"], cloud: "#ffe3e6",
		mountain: "#b590c0", snow: "#ffeef2",
		trackA: "#fff4ec", trackB: "#f8e3d6", trackRim: "#ea5f78", trackSide: ["#e8c6b3", "#8d5d6c"],
	},
	{ // Pastel, blossom trees
		skyTop: "#7f8cf5", skyHorizon: "#f8d8f2", sunDir: [0.6, 0.25, -0.76], sunGlow: "#fff4fb",
		hemiSky: "#ffffff", hemiGround: "#9a8ab8", sunLight: "#fff6fb",
		sea: "#3fc0d8", grass: "#8ee08a", dirt: "#9a6f5a", rock: "#b4a6d6", trunk: "#6b4a3a",
		leaves: ["#ff8fc1", "#ffb3d9", "#f472b6", "#fbcfe8"], cloud: "#ffffff",
		mountain: "#b7a8ea", snow: "#fbf8ff",
		trackA: "#f7f1ff", trackB: "#ece2fb", trackRim: "#8b7cf6", trackSide: ["#dccff3", "#7d6bb0"],
	},
];

/** Theme of a level: picked from its name, so it never changes. */
export function levelTheme(level: LevelData): Theme {
	return THEMES[hash(level.name) % THEMES.length];
}

export function hash(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}
