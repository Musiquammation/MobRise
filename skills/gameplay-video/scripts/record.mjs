/**
 * Records the clips of the storyboard from the dev server, frame by frame.
 *
 *   node skills/gameplay-video/scripts/record.mjs [clip,clip...]
 *
 * -> dist/gameplay-video/frames/<clip>/0000.jpg ...   (1080x1920, 30 fps)
 *    dist/gameplay-video/frames/<clip>/sfx.json        (sound effects the game played, in clip time)
 *
 * The game loop is frozen: every video frame advances the game by fixed 1/60 s
 * steps (2 per frame at 30 fps, fewer for slow motion), then the page is
 * screenshotted with an HTML overlay (captions, finger, cards) on top.
 * Sound effects are not played: the game's `audio` singleton is patched to log
 * each sound with the video time, assemble.mjs renders them later.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch, mkdir, PROMO_DIR, DEV_URL, ROOT } from '../../android-presentation/scripts/lib.mjs';
import { clips } from './storyboard.mjs';

export const FPS = 30;
const OUT = path.join(ROOT, 'dist/gameplay-video/frames');
const ALL_SKINS = ['blue', 'red', 'green', 'cap', 'party', 'ninja', 'wizard', 'viking', 'king', 'angel'];
const VIEWPORT = { width: 540, height: 960 }; // x2 = 1080x1920
const only = process.argv[2]?.split(',');

/** Installed in the page (window.__h): frozen game loop, bot planner, sound log, overlay. */
const HELPERS = async () => {
	const app = window.mobrise;
	const h = window.__h = {
		paused: true, sfx: [], rec: false, now: 0,
		patch() {
			const g = app.game;
			if (g.__patched) return;
			g.__patched = true;
			g.__orig = g.step.bind(g);
			// The RAF loop only re-renders the frozen frame.
			g.step = dt => { if (h.paused) g.renderer.render(g.scene, g.camera.get()); else g.__orig(dt); };
		},
		play() { app.play(); h.patch(); },
		sim(seconds, o = {}) {
			const g = app.game; h.patch();
			const n = Math.round(seconds * 60);
			for (let i = 0; i < n; i++) {
				if (o.plan) { app.input.x = null; app.input.y = null; g.pointerX = h.planX(); }
				if (o.steer !== undefined && o.steer !== null) { app.input.x = null; app.input.y = null; g.pointerX = o.steer; }
				if (o.aim) { const boxes = g.entities.get('box'); const b = boxes[o.aim.box % boxes.length]; if (b) g.aimPoint.copy(b.position); }
				g.__orig(1 / 60);
			}
			g.renderer.render(g.scene, g.camera.get());
			return { phase: g.phase, crowd: g.crowdSize(), z: Math.round(-g.crowdCenter().z) };
		},
		noShields() { for (const p of app.game.entities.get('player')) p.shield = false; },

		/**
		 * Bot plan (same greedy look-ahead as src/debug/levelBot.ts) on a headless
		 * copy of the level, with the clip's skin: pointer x every `step` seconds.
		 */
		async plan(file, upTo, skinId, step = 0.3) {
			const bot = await import('/src/debug/levelBot.ts');
			const { Game } = await import('/src/game/Game.ts');
			const { SKINS } = await import('/src/data/skins.ts');
			const level = await bot.loadLevel(file);
			const Group = app.game.scene.constructor;
			const game = new Game({ getSize: v => v.set(800, 600), render() {} },
				{ x: null, y: null, presses: 0, down: false, reset() {} },
				{ getModel: () => ({ scene: new Group() }) },
				level, SKINS.find(s => s.id === skinId) ?? SKINS[0], { onCoins() {}, onEnd() {} });
			// Same time spent in the menu as the real game (blinking spikes, archers...).
			const idle = Math.round((app.game.time ?? 0) * 60);
			for (let i = 0; i < idle; i++) game.gameFrame(1 / 60);
			game.start(null);
			const t0 = game.time, w = level.width / 2;
			const cands = [-w - 1.5, -w + 1, -w + 2.2, -1, 0, 1, w - 2.2, w - 1, w + 1.5];
			const xs = []; let x = 0;
			while (game.phase === 'run' && game.time - t0 < upTo) {
				let best = x, bestScore = -Infinity;
				for (const cx of [x, ...cands]) {
					const sim = bot.cloneGame(game); bot.advance(sim, cx, step);
					let follow = -Infinity;
					for (const fx of [cx, cands[0], 0, cands[cands.length - 1]]) {
						const s2 = bot.cloneGame(sim); bot.advance(s2, fx, 2.5);
						follow = Math.max(follow, bot.alive(s2) - (s2.phase === 'run' && s2.crowd.length === 0 ? 1000 : 0));
					}
					const score = follow - Math.abs(cx - x) * 0.05;
					if (score > bestScore) { bestScore = score; best = cx; }
				}
				x = best; xs.push(x); bot.advance(game, x, step);
			}
			h.planXs = xs; h.planStep = step;
			return { steps: xs.length, alive: bot.alive(game), phase: game.phase };
		},
		planX() { const i = Math.floor((app.game.time - h.t0) / h.planStep); return h.planXs[Math.min(h.planXs.length - 1, Math.max(0, i))] ?? 0; },
	};

	// ---- Sound log: the game calls audio.play / audio.enqueue, which end in audio.start(id, when, options).
	// A fake AudioContext whose clock is the video time; nothing is played.
	const { audio } = await import('/src/audio/audio.ts');
	audio.ctx = { get currentTime() { return h.now; }, resume: () => Promise.resolve(), suspend: () => Promise.resolve(), state: 'running' };
	audio.musicGain = null;
	audio.canPlay = () => h.rec;
	audio.start = (id, when, o = {}) => h.sfx.push({ id, t: +when.toFixed(4), rate: o.rate ?? 1, detune: o.detune ?? 0.05, volume: o.volume ?? 1 });

	// ---- Overlay
	const st = document.createElement('style');
	st.textContent = `
	#__ov{position:fixed;inset:0;z-index:9999;pointer-events:none;font-family:'Lilita One',sans-serif;color:#fff;overflow:hidden}
	#__ov .cap{position:absolute;text-align:center;line-height:.95;
		text-shadow:0 5px 0 #1b1440,0 -2px 0 #1b1440,3px 0 0 #1b1440,-3px 0 0 #1b1440,3px 3px 0 #1b1440,-3px 3px 0 #1b1440,0 10px 18px rgba(0,0,0,.45)}
	#__ov .cap b{color:#ffd23f;font-weight:normal}
	#__ov .sub{position:absolute;text-align:center;font-size:34px;
		text-shadow:0 3px 0 #1b1440,2px 0 0 #1b1440,-2px 0 0 #1b1440,0 -2px 0 #1b1440}
	#__ov .finger{position:absolute;width:96px;height:96px;margin:-48px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.35));border-radius:50%;
		background:radial-gradient(circle,rgba(255,255,255,.95) 0 34%,rgba(255,255,255,.35) 36% 62%,rgba(255,255,255,0) 64%);}
	#__ov .trail{position:absolute;height:22px;margin-top:-11px;border-radius:11px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.75))}
	#__ov .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}
	#__ov .shade{position:absolute;inset:0}
	#__ov .badge{position:relative;width:200px;height:200px;border-radius:50%;background:#fff;border:16px solid #ff3355;box-sizing:border-box;
		display:flex;align-items:center;justify-content:center;font-size:88px;color:#1b1440;box-shadow:0 12px 0 rgba(0,0,0,.25)}
	#__ov .badge:after{content:'';position:absolute;left:50%;top:50%;width:190px;height:16px;background:#ff3355;transform:translate(-50%,-50%) rotate(-45deg);border-radius:8px}
	#__ov .pill{background:#ffd23f;color:#1b1440;font-size:30px;padding:10px 26px;border-radius:40px;box-shadow:0 6px 0 #c48d00;white-space:nowrap}
	#__ov .icon{width:190px;height:190px;border-radius:42px;box-shadow:0 12px 0 rgba(0,0,0,.25),0 0 0 6px #fff}
	#__ov .chip{display:inline-block;background:rgba(255,255,255,.16);border:3px solid rgba(255,255,255,.5);border-radius:30px;padding:6px 18px;font-size:28px;margin:0 6px;text-shadow:0 3px 0 #1b1440}
	header,[data-pause],[data-settings],#game > mark{display:none!important}
	canvas,#game,#main,#shop,#levels{transform-origin:50% 55%}
	`;
	document.head.append(st);
	const ov = document.createElement('div');
	ov.id = '__ov';
	document.body.append(ov);
	const pop = (t, d) => { t /= d; return t <= 0 ? 0 : t >= 1 ? 1 : 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2; };
	let prevFx = null;
	window.__ov = (o) => {
		let html = '';
		const W = innerWidth, H = innerHeight;
		document.querySelector('canvas').style.filter = o.blur ? `blur(${o.blur}px) saturate(1.1)` : '';
		const z = o.zoom ?? 1;
		for (const el of document.querySelectorAll('canvas,#game,#main,#shop,#levels')) el.style.transform = z !== 1 ? `scale(${z})` : '';
		for (const c of o.caps ?? []) {
			if (c.t < 0) continue;
			const s = pop(c.t, c.d ?? 0.25) * (c.pulse ? 1 + 0.035 * Math.sin(c.t * 12) : 1);
			const out = c.out !== undefined && c.out >= 0 ? Math.max(0, 1 - c.out / 0.15) : 1;
			const k = out < 1 ? 0.6 + 0.4 * out : 1;
			html += `<div class="cap" style="left:0;width:100%;top:${c.y ?? 9}%;font-size:${c.size ?? 64}px;transform:scale(${s * k}) rotate(${c.rot ?? -3}deg);opacity:${out}">${c.text}</div>`;
			if (c.sub) html += `<div class="sub" style="left:0;width:100%;top:calc(${c.y ?? 9}% + ${c.subOff ?? 100}px);opacity:${Math.min(1, Math.max(0, (c.t - 0.25) / 0.2)) * out}">${c.sub}</div>`;
		}
		if (o.finger) {
			// Follows the crowd's count bubble horizontally.
			const b = app.dom.panel?.bubble;
			const x = b?.visible ? b.x * z + W / 2 * (1 - z) : W / 2;
			const px = prevFx ?? x;
			prevFx = px + (x - px) * 0.5;
			const y = o.finger.y * H;
			html += `<div class="trail" style="left:${Math.min(x, px - (x - px) * 2)}px;width:${Math.abs(x - px) * 3}px;top:${y}px;${x < px ? 'transform:scaleX(-1)' : ''}"></div>`;
			html += `<div class="finger" style="left:${x}px;top:${y}px;opacity:${o.finger.a ?? 1}"></div>`;
		} else prevFx = null;
		if (o.card) html += o.card;
		ov.innerHTML = html;
	};
};

const browser = await launch();
try {
	for (const clip of clips) {
		if (only && !only.includes(clip.name)) continue;
		const dir = mkdir(path.join(OUT, clip.name));
		for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f));
		const ctx = await browser.newContext({ viewport: clip.viewport ?? VIEWPORT, deviceScaleFactor: clip.dpr ?? 2, isMobile: true, hasTouch: true, locale: 'en-US' });
		const save = { coins: 12840.5, level: 12, owned: ALL_SKINS, skin: clip.skin ?? 'blue' };
		await ctx.addInitScript(s => localStorage.setItem('mobrise-save', s), JSON.stringify(save));
		// No debug overlay (FPS counter).
		await ctx.route('**/env.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.MOBRISE_ENV = { base: "/", debug: false };' }));
		const p = await ctx.newPage();
		p.on('pageerror', e => console.log(clip.name, 'page error:', e.message));

		let url = DEV_URL;
		if (clip.bot?.file) url += `?level=${clip.bot.file}`;
		if (clip.level) {
			mkdir(PROMO_DIR);
			fs.writeFileSync(path.join(PROMO_DIR, `${clip.name}.json`), JSON.stringify(clip.level));
			url += `?level=_promo/${clip.name}.json`;
		}
		await p.goto(url);
		await p.waitForSelector('#main', { timeout: 30000 });
		await p.evaluate(HELPERS);
		// The game caps the pixel ratio at 2: lift it so frames are sharp.
		await p.evaluate(() => { const a = window.mobrise; a.renderer.setPixelRatio(window.devicePixelRatio); a.resize(); });
		await p.evaluate(() => document.fonts.ready);
		await p.waitForTimeout(clip.menu ? 1500 : 400);

		if (clip.bot) {
			await p.evaluate(() => window.__h.patch());
			const r = await p.evaluate(([f, u, sk]) => window.__h.plan(f, u, sk),
				[clip.bot.file ?? `_promo/${clip.name}.json`, (clip.pre ?? 0) + clip.dur + 1, clip.skin ?? 'blue']);
			console.log(clip.name, 'bot plan', JSON.stringify(r));
			await p.evaluate(() => { window.__h.t0 = window.mobrise.game.time; });
		}
		if (!clip.menu) {
			await p.evaluate(() => window.__h.play());
			if (clip.pre) await p.evaluate(([s, o]) => window.__h.sim(s, o), [clip.pre, clip.preOpts ?? { steer: 0 }]);
			if (clip.noShields) await p.evaluate(() => window.__h.noShields());
		}
		if (clip.setup) await clip.setup(p);

		const n = Math.round(clip.dur * FPS);
		const actions = [...(clip.actions ?? [])];
		await p.evaluate(() => { window.__h.sfx = []; window.__h.rec = true; });
		let last;
		for (let i = 0; i < n; i++) {
			const t = i / FPS;
			while (actions.length && actions[0][0] <= t) {
				await p.evaluate(tt => { window.__h.now = tt; }, t);
				await actions.shift()[1](p);
			}
			const o = clip.input ? clip.input(t) : { steer: 0 };
			const ov = clip.overlay(t);
			const speed = typeof clip.speed === 'function' ? clip.speed(t) : clip.speed ?? 1;
			const dt = i === 0 ? 0 : speed / FPS;
			last = await p.evaluate(([dt, o, ov, menu, t]) => {
				window.__h.now = t;
				const r = menu ? null : window.__h.sim(dt, o);
				window.__ov(ov);
				return r;
			}, [dt, o, ov, !!clip.menu, t]);
			if (clip.wait) await p.waitForTimeout(clip.wait);
			const png = !!clip.png;
			await p.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + (png ? '.png' : '.jpg')), ...(png ? { type: 'png' } : { type: 'jpeg', quality: 94 }) });
			if (i % 30 === 0) console.log(clip.name, `${i}/${n}`, JSON.stringify(last));
		}
		const sfx = await p.evaluate(() => { window.__h.rec = false; return window.__h.sfx; });
		fs.writeFileSync(path.join(dir, 'sfx.json'), JSON.stringify(sfx));
		console.log(clip.name, 'done', JSON.stringify(last), `${sfx.length} sounds`);
		await ctx.close();
	}
} finally {
	await browser.close();
	fs.rmSync(PROMO_DIR, { recursive: true, force: true });
}
