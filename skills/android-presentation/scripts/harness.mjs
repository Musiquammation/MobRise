/**
 * Drives the real game (dev server) frame by frame to stage screenshots.
 *
 * Each scene: a save (coins, owned skins, equipped skin), an optional staged
 * level (written to public/levels/_promo, loaded with the dev-only ?level=),
 * and a script that plays, simulates fixed 1/60 s steps and takes shots.
 * Time is frozen between steps, so shots are deterministic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEV_URL, PROMO_DIR, launch, mkdir } from './lib.mjs';

const ALL_SKINS = ['blue', 'red', 'green', 'cap', 'party', 'ninja', 'wizard', 'viking', 'king', 'angel'];
const CANNON = { boxes: 6, distance: 28, height: 8, rx: 2.5, ry: 1.5, speed: 0.15, path: 'ellipse' };

/** Minimal level (see src/data/Level.ts for every field), overridden by `o`. */
export const level = (o) => ({ name: 'promo', width: 8, length: 200, speed: 10, start: 40, holes: [], gates: [], spikes: [], cannon: CANNON, ...o });

/** Installed in the page: pause the game loop and step it manually. */
const HELPERS = () => {
	const app = window.mobrise;
	const h = window.__h = {
		paused: true,
		patch() {
			const g = app.game;
			if (g.__patched) return;
			g.__patched = true;
			g.__orig = g.step.bind(g);
			// While paused, the RAF loop only re-renders the frozen frame.
			g.step = dt => { if (h.paused) g.renderer.render(g.scene, g.camera.get()); else g.__orig(dt); };
		},
		play() { app.play(); h.patch(); },
		sim(seconds, o = {}) {
			const g = app.game; h.patch();
			const n = Math.round(seconds * 60);
			for (let i = 0; i < n; i++) {
				// Steering: set the crowd's target x directly (pointer ignored).
				if (o.steer !== undefined) { app.input.x = null; app.input.y = null; g.pointerX = o.steer; }
				// Cannon: aim at a "?" box (combos) or a fixed point.
				if (o.aim) { const boxes = g.entities.get('box'); const b = boxes[o.aim.box % boxes.length]; if (b) g.aimPoint.copy(b.position); }
				if (o.aimPoint) g.aimPoint.set(o.aimPoint[0], o.aimPoint[1], g.boxCenter.z);
				g.__orig(1 / 60);
			}
			return { phase: g.phase, crowd: g.crowdSize(), z: -g.crowdCenter().z };
		},
		/** Remove every shield bubble (they look noisy on close-ups). */
		noShields() { for (const p of app.game.entities.get('player')) p.shield = false; },
		/** Place the camera relative to the crowd center (world units). */
		cam(pos, look) {
			const g = app.game, c = g.crowdCenter(), V = g.camera.get().position.clone();
			g.camera.snap(V.clone().set(pos[0], pos[1], c.z + pos[2]), V.clone().set(look[0], look[1], c.z + look[2]));
		},
	};
};

/**
 * Runs the scenes. Shots are saved as <out>/<scene>-<name>.png.
 * width/height = CSS viewport (keep 9:16 for phones), dpr = pixel ratio.
 */
export async function run(scenes, { width = 390, height = 693, dpr = 3, out, only } = {}) {
	mkdir(out);
	mkdir(PROMO_DIR);
	const browser = await launch();
	try {
		for (const sc of scenes) {
			if (only && !only.includes(sc.name)) continue;
			const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
			const save = { coins: sc.coins ?? 12840.5, level: sc.levelIndex ?? 12, owned: ALL_SKINS, skin: sc.skin ?? 'blue' };
			await ctx.addInitScript(s => localStorage.setItem('mobrise-save', s), JSON.stringify(save));
			// No debug overlay (FPS counter) on the shots.
			await ctx.route('**/env.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.MOBRISE_ENV = { base: "/", debug: false };' }));
			const p = await ctx.newPage();
			p.on('pageerror', e => console.log(sc.name, 'page error:', e.message));

			let url = DEV_URL;
			if (sc.level) {
				fs.writeFileSync(path.join(PROMO_DIR, `${sc.name}.json`), JSON.stringify(sc.level));
				url += `?level=_promo/${sc.name}.json`;
			}
			await p.goto(url);
			await p.waitForSelector('#main', { timeout: 30000 });
			await p.evaluate(HELPERS);
			// The game caps the pixel ratio at 2: lift it so shots are sharp.
			await p.evaluate(() => { const a = window.mobrise; a.renderer.setPixelRatio(window.devicePixelRatio); a.resize(); });
			await p.waitForTimeout(300);

			const shot = async (name, opts = {}) => {
				// hideMark: hide the gate "+N" popup (it shows "+0" right after start).
				await p.evaluate(([hide, css]) => {
					let st = document.getElementById('__shot');
					if (!st) { st = document.createElement('style'); st.id = '__shot'; document.head.append(st); }
					st.textContent = (hide ? '#game > mark{display:none!important}' : '') + (css ?? '');
				}, [!!opts.hideMark, opts.css]);
				await p.waitForTimeout(opts.wait ?? 250);
				await p.screenshot({ path: path.join(out, `${sc.name}${name ? '-' + name : ''}.png`) });
				console.log('shot', sc.name, name ?? '');
			};
			const sim = async (s, o = {}) => {
				const r = await p.evaluate(([s, o]) => window.__h.sim(s, o), [s, o]);
				console.log(sc.name, 'sim', s, JSON.stringify(r));
				return r;
			};
			await sc.script({
				p, shot, sim,
				play: () => p.evaluate(() => window.__h.play()),
				noShields: () => p.evaluate(() => window.__h.noShields()),
				cam: (pos, look) => p.evaluate(([a, b]) => window.__h.cam(a, b), [pos, look]),
			});
			await ctx.close();
		}
	} finally {
		await browser.close();
		fs.rmSync(PROMO_DIR, { recursive: true, force: true });
	}
}
