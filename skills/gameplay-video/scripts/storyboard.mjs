/**
 * The storyboard: the clips of the video, in order. Edit THIS file to make a new video.
 *
 * Clip fields
 *   name         folder name of the frames (unique)
 *   dur          seconds recorded (the transitions eat into it: see `tr`)
 *   tr           [xfade transition, seconds] INTO this clip (ffmpeg xfade names:
 *                fade, fadewhite, smoothleft, smoothup, circleopen, zoomin...)
 *   skin         equipped skin (all skins are owned)
 *   level        staged level (level({...}) below, see src/data/Level.ts), or
 *   bot          { file: 'level12.json' } a real level, steered by the level bot
 *                ({} = steer the staged level with the bot)
 *   pre          seconds simulated before recording starts; preOpts = input during it
 *   input(t)     per-frame input: { steer: x } (-4..4), { plan: true } (bot), { aim: { box: i } } (cannon)
 *   speed        game seconds per video second (number or t => number): < 1 is slow motion
 *   noShields    remove the shield bubbles (noisy on close-ups)
 *   menu         no gameplay: record the menus; actions = [[t, async page => ...]] (clicks)
 *   wait         ms to wait after each frame (menus animate in real time)
 *   setup(page)  runs once before recording
 *   ov(t, c)     overlay of the frame: { caps, zoom, blur, finger, card } (helpers below)
 *   thumb        a single PNG frame (thumbnail), not part of the video
 */
import { level } from '../../android-presentation/scripts/harness.mjs';

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
/** Keyframed value: keys([[t, x], ...]) -> x(t), smoothstep between keys. */
const keys = k => t => {
	if (t <= k[0][0]) return k[0][1];
	for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], smooth((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
	return k[k.length - 1][1];
};
/** Back-out pop 0 -> 1 in d seconds. */
const pop = (t, d = 0.3) => { t /= d; return t <= 0 ? 0 : t >= 1 ? 1 : 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2; };

/**
 * Caption at the top of the screen. It pops in once the incoming transition is
 * mostly done and shrinks out before the outgoing one. `<b>` = yellow keyword.
 * o: size (px at 540 wide), y (% from top), sub (small line under), delay, until (out time), pulse, rot.
 */
const cap = (c, text, t, o = {}) => ({
	text, t: t - (c.tin ?? 0) * 0.55 - (o.delay ?? 0), d: o.d ?? 0.22,
	size: o.size ?? 80, y: o.y ?? 9, rot: o.rot ?? -3, pulse: o.pulse,
	sub: o.sub, subOff: o.subOff ?? 92,
	out: t - (o.until ?? (c.dur - (c.tout ?? 0) * 0.6 - 0.15)),
});
/** Slow camera push across the clip (2D zoom of the page): no shot is static. */
const push = (c, t, a = 1, b = 1.06) => lerp(a, b, t / c.dur);
/** Punchy one-caption overlay with a reverse zoom, for the hype part. */
const hype = (text, o = {}) => (t, c) => ({ zoom: push(c, t, 1.1, 1.0), caps: [cap(c, text, t, { size: 88, d: 0.16, pulse: true, ...o })] });

const steerGates = keys([[0, 0], [0.3, 0], [0.85, -2.1], [1.6, -2.1], [2.35, 1.9], [5.2, 1.9]]);

export const clips = [
	// ---------- 1. HOOK: the most impressive moment first, in slow motion ----------
	{
		name: 'hook', skin: 'king', pre: 0.95, noShields: true, dur: 3.4,
		level: level({ start: 400, enemies: [{ x: 0, z: 26, count: 300 }] }),
		speed: t => lerp(0.9, 0.4, (t - 0.3) / 0.6),
		ov: (t, c) => ({ zoom: push(c, t, 1.0, 1.12), caps: [cap(c, 'How <b>BIG</b> can<br>your mob get?', t, { size: 78, delay: 0.15 })] }),
	},
	// ---------- 2. CONCEPT: one simple idea per shot ----------
	{
		name: 'gates', skin: 'king', pre: 0.3, tr: ['zoomin', 0.6], dur: 5.2,
		level: level({ start: 8, gates: [
			{ z: 13, x: -2, width: 4, type: 'mul', value: 5 }, { z: 13, x: 2, width: 4, type: 'add', value: 2 },
			{ z: 33, x: -2, width: 4, type: 'add', value: 10 }, { z: 33, x: 2, width: 4, type: 'mul', value: 4 } ] }),
		input: t => ({ steer: steerGates(t) }),
		ov: (t, c) => ({
			zoom: push(c, t, 1.0, 1.05),
			caps: t < 1.9 ? [cap(c, 'SWIPE', t, { size: 96, sub: 'to steer your crowd', until: 1.75 })]
				: [cap(c, 'Pick the<br><b>BEST</b> gates', t - 1.9 + c.tin * 0.55, { size: 76 })],
			finger: t < 3.5 ? { y: 0.87, a: t > 3.3 ? (3.5 - t) / 0.2 : 1 } : null,
		}),
	},
	{
		name: 'recruits', skin: 'cap', pre: 0.4, tr: ['smoothleft', 0.55], dur: 4.0,
		level: level({ start: 25, recruits: [{ x: 0, z: 14, count: 40 }, { x: 0, z: 28, count: 80 }, { x: -2, z: 42, count: 60 }] }),
		input: t => ({ steer: t < 2.6 ? 0 : -1.6 }),
		ov: (t, c) => ({ zoom: push(c, t), caps: [cap(c, 'Recruit <b>lost</b><br>runners', t, { size: 74 })] }),
	},
	{
		name: 'army', skin: 'blue', pre: 0.2, noShields: true, tr: ['smoothleft', 0.55], dur: 3.6,
		level: level({ start: 160, enemies: [{ x: 0, z: 24, count: 120 }] }),
		ov: (t, c) => ({ zoom: push(c, t, 1.0, 1.08), caps: [cap(c, 'The <b>BIGGER</b><br>crowd wins!', t, { size: 72 })] }),
	},
	// ---------- 3. NO ADS: a full-screen promise over blurred gameplay ----------
	{
		name: 'noads', skin: 'king', pre: 0.8, tr: ['fade', 0.6], dur: 3.9,
		level: level({ start: 220 }),
		ov: (t, c) => {
			const t0 = t - 0.25, outAt = c.dur - c.tout * 0.6 - 0.15, out = t > outAt ? Math.max(0, 1 - (t - outAt) / 0.15) : 1, k = 0.6 + 0.4 * out;
			const badge = pop(t0), title = pop(t0 - 0.3), sub = Math.min(1, Math.max(0, (t0 - 0.75) / 0.25));
			return {
				blur: Math.min(8, Math.max(0, t - 0.1) * 30), zoom: push(c, t, 1.0, 1.08),
				card: `<div class="shade" style="background:rgba(27,20,64,${Math.min(0.55, Math.max(0, t - 0.1) * 2)})"></div>
				<div class="card">
					<div class="badge" style="transform:scale(${badge * k}) rotate(${(1 - Math.min(1, badge)) * -40}deg);opacity:${out}">AD</div>
					<div style="height:8px"></div>
					<div class="cap" style="position:static;font-size:118px;transform:scale(${title * k}) rotate(-3deg);opacity:${out}">NO <b>ADS</b></div>
					<div class="sub" style="position:static;opacity:${sub * out}">Not one. Ever. Just play.</div>
				</div>`,
			};
		},
	},
	// ---------- 4. HYPE: one mechanic per shot, 3-4 s each ----------
	{
		name: 'saws', skin: 'blue', pre: 0.2, noShields: true, tr: ['circleopen', 0.6], dur: 3.6, bot: {}, preOpts: { plan: true },
		level: level({ start: 60,
			saws: [{ x: 0, z: 16, axis: 'x', length: 6, speed: 5, radius: 1.1 }, { x: 2.5, z: 30, axis: 'z', length: 6, speed: 5 }],
			spikes: [{ z: 24, speed: 6 }], spikeFields: [{ x: -2, z: 36, width: 4, depth: 3 }] }),
		input: () => ({ plan: true }),
		ov: hype('Dodge<br><b>SAWS!</b>'),
	},
	{
		name: 'wind', skin: 'green', pre: 0.4, tr: ['smoothup', 0.5], dur: 3.0, bot: {}, preOpts: { plan: true },
		level: level({ start: 60, winds: [{ z: 4, depth: 30, strength: 3 }],
			archers: [{ z: 16, side: 1, interval: 0.4 }, { z: 20, side: -1, interval: 0.4, offset: 0.5 }, { z: 28, side: 1, interval: 0.4, offset: 0.25 }] }),
		input: () => ({ plan: true }),
		ov: hype('<b>ARROWS!</b>', { rot: 4 }),
	},
	{
		name: 'jump', skin: 'red', pre: 0.3, tr: ['smoothleft', 0.5], dur: 2.6,
		level: level({ start: 60, boosts: [{ x: 0, z: 6, width: 8, depth: 2 }], jumps: [{ x: 0, z: 14, width: 8 }], holes: [{ x: 0, z: 17, width: 8, depth: 10 }] }),
		ov: hype('Leap the<br><b>VOID!</b>'),
	},
	{
		name: 'flight', skin: 'wizard', pre: 0.5, tr: ['smoothup', 0.5], dur: 3.6,
		level: level({ start: 50, holes: [{ x: 0, z: 14, width: 8, depth: 6.5 }, { x: 0, z: 31, width: 8, depth: 5 }] }),
		ov: hype('Wizards<br><b>FLY!</b>', { rot: 4 }),
	},
	{
		name: 'boss', skin: 'blue', pre: 0.7, noShields: true, tr: ['zoomin', 0.5], dur: 4.0,
		level: level({ start: 110, bosses: [{ x: 0, z: 20, hp: 900, interval: 1.0 }] }),
		ov: hype('GIANT<br><b>BOSSES!</b>'),
	},
	// Real levels, steered by the bot: authentic gameplay and the other color themes.
	{
		name: 'real12', skin: 'ninja', bot: { file: 'level12.json' }, pre: 8.3, preOpts: { plan: true }, tr: ['smoothleft', 0.5], dur: 5.2,
		input: () => ({ plan: true }),
		ov: hype('Archers<br><b>EVERYWHERE!</b>', { size: 76, rot: 3 }),
	},
	{
		name: 'real24', skin: 'red', bot: { file: 'level24.json' }, pre: 7.5, preOpts: { plan: true }, tr: ['smoothup', 0.5], dur: 5.2,
		input: () => ({ plan: true }),
		ov: hype('FULL<br><b>SPEED!</b>'),
	},
	{
		name: 'real16', skin: 'viking', bot: { file: 'level16.json' }, pre: 10.6, preOpts: { plan: true }, tr: ['zoomin', 0.5], dur: 6.2,
		input: () => ({ plan: true }),
		ov: hype('Grow it.<br><b>FIGHT!</b>', { rot: 3 }),
	},
	{
		name: 'real15', skin: 'king', bot: { file: 'level15.json' }, pre: 9.3, preOpts: { plan: true }, tr: ['smoothleft', 0.5], dur: 5.4,
		input: () => ({ plan: true }),
		ov: hype('24 crazy<br><b>LEVELS!</b>'),
	},
	{
		name: 'cannon', skin: 'party', pre: 1.6, preOpts: { aim: { box: 0 } }, tr: ['circleopen', 0.5], dur: 4.4,
		level: level({ start: 150, length: 12, cannon: { boxes: 6, distance: 14, height: 5.5, rx: 2.2, ry: 1.3, speed: 0.12, path: 'figure8' } }),
		input: () => ({ aim: { box: 0 } }),
		ov: hype('CANNON<br><b>COMBOS!</b>', { rot: 4, y: 50 }),
	},
	{
		name: 'won', skin: 'party', pre: 30, preOpts: { aim: { box: 0 } }, tr: ['fade', 0.5], dur: 2.8,
		level: level({ start: 60, length: 8 }),
		setup: p => p.addStyleTag({ content: '#game > i{display:none!important}' }),
		ov: hype('Rake in<br><b>COINS!</b>', { y: 6 }),
	},
	{
		name: 'shop', skin: 'viking', menu: true, tr: ['smoothup', 0.5], wait: 25, dur: 4.8,
		actions: [
			[0, p => p.click('#main nav div button:last-child')],
			[0.9, p => p.click('#shop li:has(h3:text-is("Wizard"))')],
			[2.6, p => p.click('#shop aside [data-close]')],
			[3.0, p => p.click('#shop li:has(h3:text-is("King"))')],
		],
		ov: (t, c) => ({
			zoom: lerp(0.8, 0.84, t / c.dur), card: '<style>body{background:#2a1d6e!important}</style>',
			caps: [cap(c, 'Skins with<br><b>POWERS!</b>', t, { size: 76, y: 1.5, d: 0.16, pulse: true })],
		}),
	},
	{
		name: 'mega', skin: 'king', pre: 0.1, tr: ['circleopen', 0.55], dur: 4.0,
		level: level({ start: 40, gates: [{ z: 10, x: 0, width: 8, type: 'mul', value: 10 }] }),
		ov: (t, c) => ({
			zoom: push(c, t, 1.12, 1.0),
			caps: t < 1.3 ? [cap(c, '<b>×10</b>', t, { size: 128, pulse: true, d: 0.16, until: 1.15 })]
				: [cap(c, '<b>400</b><br>RUNNERS!', t - 1.3 + c.tin * 0.55, { size: 104, pulse: true, d: 0.18 })],
		}),
	},
	// ---------- 5. END CARD: icon, name, promise, call to action ----------
	{
		name: 'end', skin: 'king', pre: 0.6, tr: ['fadewhite', 0.7], dur: 4.8,
		level: level({ start: 400 }),
		ov: (t, c) => {
			const t0 = t - 0.3;
			return {
				blur: Math.min(6, t * 25), zoom: push(c, t, 1.0, 1.1),
				card: `<div class="shade" style="background:linear-gradient(180deg,rgba(64,36,140,.75),rgba(27,20,64,.8))"></div>
				<div class="card">
					<img class="icon" src="/icon.png" style="transform:scale(${pop(t0)}) rotate(${(1 - Math.min(1, pop(t0))) * 30}deg)">
					<div style="height:6px"></div>
					<div class="cap" style="position:static;font-size:104px;transform:scale(${pop(t0 - 0.2)}) rotate(-3deg)">Mob<b>Rise</b></div>
					<div class="pill" style="transform:scale(${pop(t0 - 0.45)})">NO ADS • FREE</div>
					<div style="opacity:${Math.min(1, Math.max(0, (t0 - 0.7) / 0.25))};margin-top:6px;white-space:nowrap"><span class="chip">24 levels</span><span class="chip">10 skins</span></div>
					<div class="cap" style="position:static;font-size:58px;margin-top:30px;transform:scale(${pop(t0 - 1.0) * (1 + 0.05 * Math.sin(t * 8))}) rotate(-2deg)">PLAY <b>NOW!</b></div>
				</div>`,
			};
		},
	},
	// ---------- THUMBNAIL (one PNG, 1080x1920) ----------
	{
		name: 'thumb', thumb: true, skin: 'king', pre: 0.95, noShields: true, png: true, viewport: { width: 720, height: 1280 }, dpr: 1.5, dur: 1 / 30,
		level: level({ start: 400, enemies: [{ x: 0, z: 26, count: 260 }] }),
		ov: () => ({
			card: `<style>canvas,#game{transform:translateY(190px) scale(1.1)!important}#game>progress{display:none!important}body{background:#28186e}</style>
			<div class="shade" style="background:linear-gradient(180deg,rgba(40,24,110,1) 0,rgba(40,24,110,.95) 30%,rgba(40,24,110,0) 46%)"></div>
			<div style="position:absolute;left:0;right:0;top:70px;display:flex;flex-direction:column;align-items:center;gap:12px">
				<img class="icon" src="/icon.png" style="width:150px;height:150px;border-radius:34px">
				<div class="cap" style="position:static;font-size:120px;transform:rotate(-3deg);margin-top:8px">Mob<b>Rise</b></div>
				<div class="cap" style="position:static;font-size:58px;transform:rotate(-3deg)">Grow your <b>MOB!</b></div>
			</div>
			<div style="position:absolute;left:0;right:0;bottom:90px;display:flex;justify-content:center"><div class="pill" style="font-size:44px;transform:rotate(-3deg)">NO ADS • FREE</div></div>`,
		}),
	},
];

// Transition lengths around each clip (captions use them), and the per-frame overlay.
clips.forEach((c, i) => {
	const next = clips[i + 1];
	c.tin = c.tr?.[1] ?? 0;
	c.tout = next && !next.thumb ? next.tr?.[1] ?? 0 : 0;
	c.overlay = t => c.ov(t, c);
});
