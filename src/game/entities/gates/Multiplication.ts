import { Gate } from "../Gate";

/** Multiplies the number of players (a value < 1 divides). */
export class Multiplication extends Gate {
	apply(count: number) {
		return Math.floor(count * this.value);
	}

	label() {
		return this.value >= 1 ? `×${this.value}` : `÷${Math.round(1 / this.value)}`;
	}

	isGood() {
		return this.value >= 1;
	}
}
