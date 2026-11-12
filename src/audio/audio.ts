import { url } from "../env";

/**
 * Music and sound effects (Web Audio).
 *
 * The files live in public/sounds (see CREDITS.md there). Browsers only let a
 * page make sound after a user gesture: the context is resumed on the first
 * touch / key, the music starts then.
 */

/** Sound effects, and the files they pick from (a random one each time). */
const SOUNDS = {
	click: ["click"],
	gateUp: ["gate_up"],
	gateDown: ["gate_down"],
	/** A player (or an enemy) dies. */
	pop: ["pop1", "pop3", "pop5", "pop6", "pop7"],
	/** A player joins the crowd. */
	spawn: ["pop1", "pop3", "pop5", "pop6", "pop7"],
	/** A "?" box is hit: two quick rising notes, like a platformer coin. */
	coin: ["coin"],
	shoot: ["shoot"],
	jump: ["jump"],
	boost: ["boost"],
	shield: ["shield"],
	win: ["win"],
	lose: ["lose"],
} satisfies Record<string, string[]>;

export type SoundId = keyof typeof SOUNDS;

/** Volume of each sound before the player setting (mixing). */
const MIX: Record<SoundId, number> = {
	click: 0.5,
	gateUp: 0.7,
	gateDown: 0.6,
	pop: 0.3,
	spawn: 0.3,
	coin: 0.28,
	shoot: 0.35,
	jump: 0.4,
	boost: 0.5,
	shield: 0.5,
	win: 0.8,
	lose: 0.7,
};

/**
 * Shortest delay (s) between two plays of the same sound: a crowd of 100
 * dying at once must not play 100 pops.
 */
const COOLDOWN: Partial<Record<SoundId, number>> = {
	coin: 0.03,
	shoot: 0.06,
	jump: 0.15,
	boost: 0.5,
	shield: 0.08,
	gateUp: 0.2,
	gateDown: 0.2,
};

/**
 * Queued sounds (one per player joining / dying), the usual game audio tools
 * for many identical events: staggered starts, a voice cap and a volume
 * that drops as voices pile up.
 *
 * With n sounds still waiting, the next one waits QUEUE_GAP / (1 + n / QUEUE_K):
 * the more there are, the closer they get, continuously. A burst of N lasts
 * about QUEUE_GAP·QUEUE_K·ln(1 + N/QUEUE_K): 0.1 s for 5, 0.2 s for 20,
 * 0.37 s for 100, 0.5 s for 300, so it ends with the crowd effect.
 */
const QUEUE_GAP = 0.035;
const QUEUE_K = 3;
/** Never closer than this (s). */
const QUEUE_MIN_GAP = 0.0005;
/** Waiting sounds beyond this are not played (the timing still accounts for them). */
const QUEUE_VOICES = 160;

/**
 * Music tracks, played one after the other in a loop (see CREDITS.md).
 * Only the compressed files stay in memory: a track is decoded shortly before
 * it plays and dropped once over (a decoded minute weighs ~20 MB).
 */
const PLAYLIST = ["music", "music2"];
/** Seconds of overlap between two tracks. */
const CROSSFADE = 2.5;
/** Seconds before a track ends at which the next one is decoded. */
const PREPARE = 12;

/** Music volume at setting 1 (it stays under the sound effects). */
const MUSIC_LEVEL = 0.45;

export type PlayOptions = {
	/** Playback rate: > 1 is higher and shorter. Default 1. */
	rate?: number;
	/** Multiplies the volume. Default 1. */
	volume?: number;
	/** Random variation of the rate (± this), so repeated sounds are less robotic. Default 0.05. */
	detune?: number;
};

class AudioPlayer {
	private ctx: AudioContext | null = null;
	private sfxGain: GainNode | null = null;
	private musicGain: GainNode | null = null;
	private readonly buffers = new Map<string, AudioBuffer>();
	private readonly lastPlay = new Map<SoundId, number>();
	/** Start times of the queued sounds of each id (the past ones are dropped lazily). */
	private readonly queues = new Map<SoundId, number[]>();
	/** Compressed music files, by playlist index (null: not loaded / failed). */
	private musicFiles: (ArrayBuffer | null)[] = [];
	/** The music started (it then chains its tracks by itself). */
	private musicStarted = false;
	private volumes = { music: 1, sounds: 1 };
	private unlocked = false;
	/** Music lowered (end of a level, so the jingle stands out). */
	private ducked = false;

	constructor() {
		const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AC) return;
		this.ctx = new AC();
		this.sfxGain = this.ctx.createGain();
		this.sfxGain.connect(this.ctx.destination);
		this.musicGain = this.ctx.createGain();
		this.musicGain.connect(this.ctx.destination);

		const unlock = () => {
			if (!this.ctx) return;
			void this.ctx.resume().then(() => {
				if (this.unlocked) return;
				this.unlocked = true;
				this.startMusic();
			});
		};
		for (const type of ["pointerdown", "touchend", "keydown"])
			window.addEventListener(type, unlock, { capture: true, passive: true });

		// No sound while the app is in the background.
		document.addEventListener("visibilitychange", () => {
			if (!this.ctx) return;
			if (document.hidden) void this.ctx.suspend();
			else if (this.unlocked) void this.ctx.resume();
		});
	}

	/** Loads the sound effects then the music. Never rejects (the game works without sound). */
	async load() {
		if (!this.ctx) return;
		const files = [...new Set(Object.values(SOUNDS).flat())];
		await Promise.all(files.map(async f => {
			const buffer = await this.fetchBuffer(`sounds/${f}.mp3`);
			if (buffer) this.buffers.set(f, buffer);
		}));
		this.musicFiles = await Promise.all(PLAYLIST.map(f => this.fetchBytes(`sounds/${f}.mp3`)));
		this.startMusic();
	}

	private async fetchBytes(path: string): Promise<ArrayBuffer | null> {
		try {
			const res = await fetch(url(path));
			if (!res.ok) throw new Error(`${res.status} ${path}`);
			return await res.arrayBuffer();
		} catch (err) {
			console.warn("sound not loaded:", path, err);
			return null;
		}
	}

	private async decode(bytes: ArrayBuffer, path = ""): Promise<AudioBuffer | null> {
		try {
			// decodeAudioData detaches its argument: keep the original for later.
			return await this.ctx!.decodeAudioData(bytes.slice(0));
		} catch (err) {
			console.warn("sound not decoded:", path, err);
			return null;
		}
	}

	private async fetchBuffer(path: string): Promise<AudioBuffer | null> {
		const bytes = await this.fetchBytes(path);
		return bytes && this.decode(bytes, path);
	}

	/** Volumes in [0, 1] (the player settings). */
	setVolumes(music: number, sounds: number) {
		this.volumes = { music, sounds };
		this.applyVolumes(0.05);
		if (music > 0) this.startMusic();
	}

	private applyVolumes(fade: number) {
		if (!this.ctx || !this.sfxGain || !this.musicGain) return;
		const now = this.ctx.currentTime;
		// Squared: the slider feels linear to the ear.
		this.sfxGain.gain.setTargetAtTime(this.volumes.sounds ** 2, now, fade);
		const music = this.volumes.music ** 2 * MUSIC_LEVEL * (this.ducked ? 0.3 : 1);
		this.musicGain.gain.setTargetAtTime(music, now, fade);
	}

	/** Lowers the music for a while (jingles), or brings it back. */
	duck(on: boolean) {
		if (this.ducked === on) return;
		this.ducked = on;
		this.applyVolumes(on ? 0.08 : 0.6);
	}

	private startMusic() {
		if (!this.ctx || !this.musicGain || this.musicStarted || !this.unlocked) return;
		const first = this.nextTrack(-1);
		if (first < 0) return;
		this.musicStarted = true;
		// Fade in.
		this.musicGain.gain.setValueAtTime(0, this.ctx.currentTime);
		this.applyVolumes(0.8);
		void this.playTrack(first, this.ctx.currentTime, 0);
	}

	/** Index of the loaded track after `index` (looping), -1 when none is loaded. */
	private nextTrack(index: number): number {
		for (let i = 1; i <= PLAYLIST.length; i++) {
			const next = (index + i) % PLAYLIST.length;
			if (this.musicFiles[next]) return next;
		}
		return -1;
	}

	/**
	 * Plays track `index` from `when` (context time), fading in over `fadeIn`,
	 * and chains the next one, which starts CROSSFADE seconds before its end.
	 */
	private async playTrack(index: number, when: number, fadeIn: number) {
		const ctx = this.ctx!;
		const buffer = await this.decode(this.musicFiles[index]!, PLAYLIST[index]);
		if (!buffer) {
			// Broken file: forget it and go on with the others.
			this.musicFiles[index] = null;
			const next = this.nextTrack(index);
			if (next >= 0) void this.playTrack(next, Math.max(when, ctx.currentTime), fadeIn);
			return;
		}
		const start = Math.max(when, ctx.currentTime);
		const end = start + buffer.duration;
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		const gain = ctx.createGain();
		source.connect(gain).connect(this.musicGain!);
		gain.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, start);
		if (fadeIn > 0) gain.gain.linearRampToValueAtTime(1, start + fadeIn);
		const fadeOut = Math.min(CROSSFADE, buffer.duration / 4);
		gain.gain.setValueAtTime(1, end - fadeOut);
		gain.gain.linearRampToValueAtTime(0, end);
		source.start(start);
		source.onended = () => source.disconnect();

		// Decode the next track a bit before it is needed (context time only
		// runs while the app is shown: check again until it is close enough).
		const next = this.nextTrack(index);
		const prepare = () => {
			const now = ctx.currentTime;
			const left = end - fadeOut - now;
			// Not before this track has started: one track ahead at most.
			if (left > PREPARE || now < start) {
				setTimeout(prepare, Math.max(left - PREPARE, start - now, 0.1) * 1000);
				return;
			}
			void this.playTrack(next, end - fadeOut, fadeOut);
		};
		prepare();
	}

	private canPlay(): boolean {
		return !!this.ctx && !!this.sfxGain && this.unlocked && this.volumes.sounds > 0 && this.ctx.state === "running";
	}

	/** Plays a sound now (skipped if the same one just played, see COOLDOWN). */
	play(id: SoundId, options: PlayOptions = {}) {
		if (!this.canPlay()) return;
		const now = this.ctx!.currentTime;
		const cooldown = COOLDOWN[id] ?? 0.03;
		if (now - (this.lastPlay.get(id) ?? -Infinity) < cooldown) return;
		this.lastPlay.set(id, now);
		this.start(id, now, options);
	}

	/**
	 * Plays one sound per call, staggered (see QUEUE_GAP). `pitch(density)`,
	 * with density in [0, 1) growing with the number of waiting sounds, gives
	 * the rate: the pitch can rise or fall along a burst.
	 */
	enqueue(id: SoundId, pitch: (density: number) => number, options: PlayOptions = {}) {
		if (!this.canPlay()) return;
		const now = this.ctx!.currentTime;
		let queue = this.queues.get(id) ?? [];
		// A sound starting right now still counts (several calls in one frame share `now`).
		if (queue.length && queue[0] < now) queue = queue.filter(t => t >= now);
		const waiting = queue.length;
		const last = queue.length ? queue[queue.length - 1] : now - QUEUE_GAP;
		const gap = Math.max(QUEUE_MIN_GAP, QUEUE_GAP / (1 + waiting / QUEUE_K));
		const at = Math.max(now, last + gap);
		queue.push(at);
		this.queues.set(id, queue);
		if (waiting >= QUEUE_VOICES) return;

		const density = waiting / (waiting + 4 * QUEUE_K);
		// Many voices at once add up: each gets quieter (√ keeps the burst fuller than one pop).
		const volume = (options.volume ?? 1) / Math.sqrt(1 + waiting / (2 * QUEUE_K));
		this.start(id, at, { ...options, volume, rate: (options.rate ?? 1) * pitch(density) });
	}

	private start(id: SoundId, when: number, options: PlayOptions) {
		const ctx = this.ctx!;
		const files = SOUNDS[id];
		const buffer = this.buffers.get(files[Math.floor(Math.random() * files.length)]);
		if (!buffer) return;

		const source = ctx.createBufferSource();
		source.buffer = buffer;
		const detune = options.detune ?? 0.05;
		source.playbackRate.value = (options.rate ?? 1) * (1 + (Math.random() * 2 - 1) * detune);
		const gain = ctx.createGain();
		gain.gain.value = MIX[id] * (options.volume ?? 1);
		source.connect(gain).connect(this.sfxGain!);
		source.start(when);
	}
}

/** The single audio player of the game. */
export const audio = new AudioPlayer();
