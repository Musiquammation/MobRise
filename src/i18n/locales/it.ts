import type { Messages } from "../index";

export default {
	main: {
		level: "Livello {n}",
		play: "Gioca",
		skins: "Skin",
	},
	game: {
		aim: "Mira ai <b>?</b>",
		shots: "Colpi {n}",
		level: "Livello {n}",
		next: "Avanti",
		lost: "Perso",
		retry: "Riprova",
	},
	shop: {
		title: "Skin",
		equipped: "Equipaggiato",
		equip: "Equipaggia",
		back: "Indietro",
		close: "Chiudi",
		stats: {
			flight: "Volo",
			shield: "Scudo",
			speed: "Velocità",
			coins: "Monete",
		},
		hints: {
			flight: "Salta da solo quando finisce il terreno, più in alto e più lontano.",
			shield: "Probabilità che ogni corridore abbia uno scudo che blocca un colpo.",
			speed: "Corre e schiva più veloce.",
			coins: "Moltiplica le monete guadagnate quando il livello è superato.",
		},
		power: "Media",
	},
	skins: {
		blue: "Blu",
		red: "Rosso",
		green: "Verde",
		cap: "Berretto",
		party: "Festa",
		ninja: "Ninja",
		king: "Re",
		wizard: "Mago",
		viking: "Vichingo",
		angel: "Angelo",
	},
	levels: {
		welcome: "Benvenuto!",
		firstSteps: "Primi passi",
		mindTheHole: "Attento al buco",
		spikeField: "Campo di spine",
		redTowers: "Le torri rosse",
		bigMix: "Il grande mix",
	},
} satisfies Messages;
