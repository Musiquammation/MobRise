import { Gate } from "../Gate";

/** Adds (or removes, when negative) players. */
export class Addition extends Gate {
	apply(count: number) {
		return count + this.value;
	}

	label() {
		return this.value >= 0 ? `+${this.value}` : `−${-this.value}`;
	}

	isGood() {
		return this.value >= 0;
	}
}
