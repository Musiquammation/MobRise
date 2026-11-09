import { Gate } from "../Gate";

/** Adds (or removes, when negative) a percentage of the players. Green when good. */
export class Percentage extends Gate {
	apply(count: number) {
		const delta = count * this.value / 100;
		// Always changes the count by at least one player.
		return count + (this.value >= 0 ? Math.max(1, Math.ceil(delta)) : Math.min(-1, Math.floor(delta)));
	}

	label() {
		return this.value >= 0 ? `+${this.value}%` : `−${-this.value}%`;
	}

	isGood() {
		return this.value >= 0;
	}

	color() {
		return this.isGood() ? "#22b350" : super.color();
	}
}
