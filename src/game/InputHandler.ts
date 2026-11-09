/**
 * Touch / mouse input through pointer events.
 * Only the first active pointer is tracked (one finger controls the game).
 */
export class InputHandler {
	/** Whether a finger (or the mouse button) is down. */
	down = false;
	/** Last known pointer position, in CSS pixels. null before any input. */
	x: number | null = null;
	y: number | null = null;

	/** Incremented on every press (lets relative controls ignore the jump to a new touch). */
	presses = 0;

	private pointerId: number | null = null;

	constructor(target: EventTarget = window) {
		target.addEventListener("pointerdown", e => this.onDown(e as PointerEvent));
		target.addEventListener("pointermove", e => this.onMove(e as PointerEvent));
		target.addEventListener("pointerup", e => this.onUp(e as PointerEvent));
		target.addEventListener("pointercancel", e => this.onUp(e as PointerEvent));
	}

	reset() {
		this.down = false;
		this.pointerId = null;
		this.x = this.y = null;
	}

	private onDown(e: PointerEvent) {
		if (this.pointerId !== null) return;
		this.pointerId = e.pointerId;
		this.down = true;
		this.presses++;
		this.x = e.clientX;
		this.y = e.clientY;
	}

	private onMove(e: PointerEvent) {
		// A mouse without button still moves the aim; touches only when down.
		if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
		if (this.pointerId === null && e.pointerType !== "mouse") return;
		this.x = e.clientX;
		this.y = e.clientY;
	}

	private onUp(e: PointerEvent) {
		if (e.pointerId !== this.pointerId) return;
		this.pointerId = null;
		this.down = false;
	}
}
