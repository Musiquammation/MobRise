/** Minimal FPS overlay, refreshed a few times per second to stay cheap. */
export class FpsCounter {
	private readonly el = document.createElement("div");
	private frames = 0;
	private worst = 0;
	private last = performance.now();
	private prev = this.last;

	constructor(private readonly interval = 500) {
		this.el.id = "fps";
		document.body.appendChild(this.el);
		this.el.textContent = "– FPS";
		const loop = (t: number) => { this.tick(t); requestAnimationFrame(loop); };
		requestAnimationFrame(loop);
	}

	private tick(now: number) {
		this.frames++;
		this.worst = Math.max(this.worst, now - this.prev);
		this.prev = now;

		const elapsed = now - this.last;
		if (elapsed < this.interval) return;
		const fps = (this.frames * 1000) / elapsed;
		this.el.textContent = `${fps.toFixed(0)} FPS · max ${this.worst.toFixed(1)} ms`;
		this.frames = 0;
		this.worst = 0;
		this.last = now;
	}
}
