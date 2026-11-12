/**
 * Renders the store icon from the dedicated three.js scene (iconScene.ts),
 * served by the dev server.
 *
 *   node skills/android-presentation/scripts/icon/render-icon.mjs [name] [extra query]
 *
 * Default = the validated icon: a golden King (blocky, game proportions),
 * fist up, in front of a rising tide of blue runners, sun rising behind his
 * crown on a purple sky. Output: dist/android-presentation/icon-1024.png and
 * icon-512.png (the one uploaded to Google Play, < 1 MB).
 * With a name, writes icon-<name>-1024.png / -512.png instead (for variants).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEV_URL, OUT, launch, mkdir } from '../lib.mjs';

export const FINAL_QUERY = [
	'c=rise', 'n=1300', 'depth=16', 'slope=0.7',
	// Crowd: darker blue, fading into a purple haze.
	'cc=%232a64d6', 'fog=%23b45fd8', 'fn=3', 'ff=18', 'bg=purple',
	// King: orange-gold body, light gold crown, big and centered.
	'kc=%23f59e0b', 'crown=%23ffd84a', 'ks=2.0', 'kx=0.25',
	// Camera low, looking up; the sun glow sits right behind the crown.
	'cam=0.3,1.0,-4.2', 'look=0,3.1,4', 'cy=22',
].join('&');

const [name, extra = ''] = process.argv.slice(2);
const query = FINAL_QUERY + (extra ? '&' + extra : '');
const suffix = name ? `-${name}` : '';
mkdir(OUT);

const browser = await launch();
try {
	const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 2 });
	page.on('pageerror', e => console.log('page error:', e.message));
	await page.goto(new URL('skills/android-presentation/scripts/icon/index.html?' + query, DEV_URL).href);
	await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
	await page.waitForTimeout(200);
	const big = path.join(OUT, `icon${suffix}-1024.png`);
	await page.locator('#icon').screenshot({ path: big });

	// High quality 2x downscale in the browser (no ImageMagick needed).
	const data = fs.readFileSync(big).toString('base64');
	const small = await page.evaluate(async (b64) => {
		const im = new Image();
		im.src = 'data:image/png;base64,' + b64;
		await im.decode();
		const c = document.createElement('canvas');
		c.width = c.height = 512;
		const ctx = c.getContext('2d');
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(im, 0, 0, 512, 512);
		return c.toDataURL('image/png').split(',')[1];
	}, data);
	fs.writeFileSync(path.join(OUT, `icon${suffix}-512.png`), Buffer.from(small, 'base64'));
	console.log('icon written:', big, 'and 512 px');
} finally {
	await browser.close();
}
