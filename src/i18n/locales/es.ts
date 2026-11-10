import type { Messages } from "../index";

export default {
	main: {
		level: "Nivel {n}",
		play: "Jugar",
		skins: "Aspectos",
	},
	game: {
		aim: "Apunta a los <b>?</b>",
		shots: "Disparos {n}",
		level: "Nivel {n}",
		next: "Siguiente",
		lost: "Perdido",
		retry: "Reintentar",
	},
	shop: {
		title: "Aspectos",
		equipped: "Equipado",
		equip: "Equipar",
		back: "Volver",
		close: "Cerrar",
		stats: {
			flight: "Vuelo",
			shield: "Escudo",
			speed: "Velocidad",
			coins: "Monedas",
		},
		hints: {
			flight: "Salta solo cuando se acaba el suelo, más alto y más lejos.",
			shield: "Probabilidad de que cada corredor tenga un escudo que bloquea un golpe.",
			speed: "Corre y esquiva más rápido.",
			coins: "Multiplica las monedas ganadas al superar el nivel.",
		},
		power: "Media",
	},
	skins: {
		blue: "Azul",
		red: "Rojo",
		green: "Verde",
		cap: "Gorra",
		party: "Fiesta",
		ninja: "Ninja",
		king: "Rey",
		wizard: "Mago",
		viking: "Vikingo",
		angel: "Ángel",
	},
	levels: {
		welcome: "¡Bienvenido!",
		firstSteps: "Primeros pasos",
		mindTheHole: "Cuidado con el hoyo",
		spikeField: "Campo de pinchos",
		redTowers: "Las torres rojas",
		bigMix: "La gran mezcla",
	},
} satisfies Messages;
