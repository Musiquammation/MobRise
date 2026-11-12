/**
 * Captures raw gameplay shots from the dev server.
 *
 *   node skills/android-presentation/scripts/capture.mjs phone  [scene,scene...]
 *   node skills/android-presentation/scripts/capture.mjs tablet [scene,scene...]
 *
 * phone  -> dist/android-presentation/_raw/phone/  (390x693 CSS @3x = 1170x2079, 9:16)
 * tablet -> dist/android-presentation/_raw/tablet/ (768x1024 CSS @2x = 1536x2048, 3:4)
 * Then build a contact sheet and LOOK at it before picking frames for render.mjs.
 */
import path from 'node:path';
import { RAW } from './lib.mjs';
import { run } from './harness.mjs';
import { scenes } from './scenes.mjs';

const [target = 'phone', list] = process.argv.slice(2);
const only = list?.split(',');
const profiles = {
	phone: { width: 390, height: 693, dpr: 3 },
	tablet: { width: 768, height: 1024, dpr: 2 },
};
if (!profiles[target]) {
	console.error(`Unknown target "${target}" (phone | tablet).`);
	process.exit(1);
}
await run(scenes, { ...profiles[target], out: path.join(RAW, target), only });
