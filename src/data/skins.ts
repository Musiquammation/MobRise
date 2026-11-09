export type Skin = {
	id: string;
	name: string;
	price: number;
	color: string;
	/** Model id of the hat, if any. */
	hat: string | null;
};

export const SKINS: Skin[] = [
	{ id: "blue", name: "Bleu", price: 0, color: "#3b82f6", hat: null },
	{ id: "red", name: "Rouge", price: 30, color: "#ef4444", hat: null },
	{ id: "green", name: "Vert", price: 30, color: "#22c55e", hat: null },
	{ id: "cap", name: "Casquette", price: 60, color: "#f59e0b", hat: "hat_cap" },
	{ id: "party", name: "Fête", price: 90, color: "#a855f7", hat: "hat_party" },
	{ id: "ninja", name: "Ninja", price: 120, color: "#1f2937", hat: "hat_band" },
	{ id: "king", name: "Roi", price: 250, color: "#eab308", hat: "hat_crown" },
];

export function getSkin(id: string): Skin {
	return SKINS.find(s => s.id === id) ?? SKINS[0];
}
