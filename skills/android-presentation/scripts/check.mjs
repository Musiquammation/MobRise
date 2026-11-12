/**
 * Checks dist/android-presentation against the Google Play requirements
 * (size, ratio, weight, counts) and builds contact sheets to review.
 *
 *   node skills/android-presentation/scripts/check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { OUT } from './lib.mjs';

/** Width / height from the PNG header. */
function size(file) {
	const b = fs.readFileSync(file);
	if (b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} is not a PNG`);
	return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}
const MB = 1024 * 1024;
const RULES = [
	{ glob: 'icon-512.png', test: s => s.w === 512 && s.h === 512 && s.bytes <= MB, rule: '512x512, <= 1 MB' },
	{ glob: 'feature-graphic-1024x500.png', test: s => s.w === 1024 && s.h === 500 && s.bytes <= 15 * MB, rule: '1024x500, <= 15 MB' },
	{ dir: 'phone', min: 2, max: 8, test: s => is169(s) && side(s, 320, 3840) && s.bytes <= 8 * MB, rule: '16:9 or 9:16, sides 320-3840, <= 8 MB (>= 1080 px to be featured)' },
	{ dir: 'tablet-7in', min: 0, max: 8, test: s => is169(s) && side(s, 320, 3840) && s.bytes <= 8 * MB, rule: '16:9 or 9:16, sides 320-3840, <= 8 MB' },
	{ dir: 'tablet-10in', min: 0, max: 8, test: s => is169(s) && side(s, 1080, 7680) && s.bytes <= 8 * MB, rule: '16:9 or 9:16, sides 1080-7680, <= 8 MB' },
];
function is169({ w, h }) { const r = Math.max(w, h) / Math.min(w, h); return Math.abs(r - 16 / 9) < 0.01; }
function side({ w, h }, lo, hi) { return Math.min(w, h) >= lo && Math.max(w, h) <= hi; }

let ok = true;
for (const r of RULES) {
	const files = r.glob ? [path.join(OUT, r.glob)] : fs.existsSync(path.join(OUT, r.dir))
		? fs.readdirSync(path.join(OUT, r.dir)).filter(f => f.endsWith('.png')).sort().map(f => path.join(OUT, r.dir, f)) : [];
	if (r.glob && !fs.existsSync(files[0])) { console.log(`MISSING ${r.glob}`); ok = false; continue; }
	if (r.dir) {
		const note = files.length > r.max ? ` (Play takes ${r.max}: upload the first ${r.max}, the rest are alternates)` : '';
		console.log(`${r.dir}: ${files.length} image(s)${note}`);
		if (files.length < r.min) { console.log(`  needs at least ${r.min}`); ok = false; }
	}
	for (const f of files) {
		const s = size(f);
		const good = r.test(s);
		ok &&= good;
		console.log(`  ${good ? 'ok ' : 'BAD'} ${path.relative(OUT, f)} ${s.w}x${s.h} ${(s.bytes / 1024).toFixed(0)} KB${good ? '' : '  -> ' + r.rule}`);
	}
}
console.log(ok ? '\nAll images match the Google Play requirements.' : '\nSome images do not match: fix them before uploading.');
process.exitCode = ok ? 0 : 1;
