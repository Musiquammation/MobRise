import { Gate } from "../Gate";

/** Sets the number of players to exactly `value` (spawns or kills). Purple. */
export class SetCount extends Gate {
	apply() {
		return this.value;
	}

	label() {
		return `=${this.value}`;
	}

	/** Neither good nor bad: depends on the crowd. Never mixed up with red rows. */
	isGood() {
		return true;
	}

	color() {
		return "#9333ea";
	}
}
