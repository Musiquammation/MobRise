/**
 * Shared helpers for the android-presentation skill.
 * Run every script from the project root, with the dev server up (npm run dev).
 */
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const OUT = path.join(ROOT, 'dist/android-presentation');
/** Intermediate captures (not uploaded). */
export const RAW = path.join(OUT, '_raw');
export const DEV_URL = process.env.DEV_URL ?? 'http://localhost:5173/';
/** Staged levels are written here during captures, then removed. */
export const PROMO_DIR = path.join(ROOT, 'public/levels/_promo');

if (!fs.existsSync(path.join(ROOT, 'package.json')) || !fs.existsSync(path.join(ROOT, 'public/levels'))) {
	console.error('Run this script from the MobRise project root.');
	process.exit(1);
}

let chromium;
try {
	({ chromium } = await import('playwright-core'));
} catch {
	console.error('playwright-core is missing: run `npm i --no-save playwright-core` in the project root.');
	process.exit(1);
}

/**
 * Headless Chrome with a real GPU (WebGL is far faster and prettier than
 * SwiftShader). CHROME=<path> overrides the executable.
 */
export function launch() {
	const executablePath = process.env.CHROME
		?? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
	return chromium.launch({
		executablePath, headless: true,
		args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--allow-file-access-from-files'],
	});
}

export function mkdir(dir) {
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}
