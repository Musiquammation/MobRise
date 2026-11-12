/**
 * Staged scenes: one per gameplay feature worth showing. Each scene builds a
 * short level around ONE mechanic, then plays it and shoots several moments
 * (a, b, c...) so the best frame can be picked. Adapt them when the game
 * gains mechanics (src/data/Level.ts lists every level field).
 *
 * script helpers: play(), sim(seconds, { steer: x | aim: { box: i } }),
 * shot(name, { hideMark, wait, css }), noShields(), cam(pos, look), p (Playwright page).
 */
import { level } from './harness.mjs';
const H = { hideMark: true };
export const scenes = [
  { name: 'gates', skin: 'king', level: level({ start: 70, gates: [
      { z: 16, x: -2, width: 4, type: 'mul', value: 3 }, { z: 16, x: 2, width: 4, type: 'add', value: 20 },
      { z: 42, x: -2, width: 4, type: 'add', value: 50 }, { z: 42, x: 2, width: 4, type: 'mul', value: 2 },
      { z: 72, x: -2, width: 4, type: 'pct', value: 50 }, { z: 72, x: 2, width: 4, type: 'set', value: 400 } ] }),
    async script({ play, sim, shot }) {
      await play(); await sim(0.6, { steer: -1.2 }); await shot('a', H);
      await sim(0.55, { steer: -1.2 }); await shot('b', H);
      await sim(0.8, { steer: 0 }); await shot('c');
      await sim(1.7, { steer: 2 }); await shot('d', H);
      await sim(1.0, { steer: 2 }); await shot('e', H);
      await sim(0.8, { steer: 2 }); await shot('f');
    } },
  { name: 'boss', skin: 'blue', level: level({ start: 70, bosses: [{ x: 0, z: 20, hp: 3000, interval: 1.0 }] }),
    async script({ play, sim, shot }) {
      await play(); await sim(1.0, { steer: 0 }); await shot('a', H);
      for (const k of ['b','c','d','e','f']) { await sim(0.35, { steer: 0 }); await shot(k, H); }
    } },
  { name: 'army', skin: 'ninja', level: level({ start: 160, enemies: [{ x: 0, z: 24, count: 140 }] }),
    async script({ play, sim, shot }) {
      await play(); await sim(1.0, { steer: 0 }); await shot('a', H); await sim(0.4, { steer: 0 }); await shot('b', H); await sim(0.3, { steer: 0 }); await shot('c', H);
    } },
  { name: 'hazards', skin: 'blue', level: level({ start: 60,
      saws: [{ x: 0, z: 16, axis: 'x', length: 6, speed: 5, radius: 1.1 }, { x: 2.5, z: 30, axis: 'z', length: 6, speed: 5 }],
      spikes: [{ z: 24, speed: 6 }], spikeFields: [{ x: -2, z: 36, width: 4, depth: 3 }] }),
    async script({ play, sim, shot }) {
      await play(); for (const k of ['a','b','c','d','e']) { await sim(0.4, { steer: k < 'c' ? 1.5 : -0.5 }); await shot(k, H); }
    } },
  { name: 'jump', skin: 'red', level: level({ start: 60, boosts: [{ x: 0, z: 6, width: 8, depth: 2 }],
      jumps: [{ x: 0, z: 14, width: 8 }], holes: [{ x: 0, z: 17, width: 8, depth: 16 }] }),
    async script({ play, sim, shot }) {
      await play(); await sim(0.6, { steer: 0 }); await shot('a', H);
      for (const k of ['b','c','d','e']) { await sim(0.25, { steer: 0 }); await shot(k, H); }
    } },
  { name: 'wind', skin: 'green', level: level({ start: 60, winds: [{ z: 4, depth: 30, strength: 3 }],
      archers: [{ z: 16, side: 1, interval: 0.4 }, { z: 20, side: -1, interval: 0.4, offset: 0.5 }, { z: 28, side: 1, interval: 0.4, offset: 0.25 }] }),
    async script({ play, sim, shot }) {
      await play(); for (const k of ['a','b','c','d','e']) { await sim(0.45, { steer: -1 }); await shot(k, H); }
    } },
  { name: 'recruits', skin: 'cap', level: level({ start: 25, recruits: [{ x: 0, z: 14, count: 40 }, { x: 0, z: 28, count: 80 }] }),
    async script({ play, sim, shot }) {
      await play(); for (const k of ['a','b','c','d','e','f']) { await sim(0.4, { steer: 0 }); await shot(k, H); }
    } },
  { name: 'cannon', skin: 'party', level: level({ start: 150, length: 12, cannon: { boxes: 6, distance: 14, height: 5.5, rx: 2.2, ry: 1.3, speed: 0.12, path: 'figure8' } }),
    async script({ play, sim, shot }) {
      await play(); await sim(1.4, { steer: 0 }); await shot('a', H);
      await sim(2.0, { aim: { box: 0 } }); await shot('b', H);
      await sim(2.5, { aim: { box: 0 } }); await shot('c', H);
      await sim(3.0, { aim: { box: 2 } }); await shot('d', H);
    } },
  { name: 'won', skin: 'king', level: level({ start: 60, length: 8 }),
    async script({ play, sim, shot }) {
      await play(); await sim(30, { aim: { box: 0 } }); await shot('a', { ...H, wait: 1200, css: '#game > i{display:none!important}' });
    } },
  { name: 'flight', skin: 'wizard', level: level({ start: 50, holes: [{ x: 0, z: 14, width: 8, depth: 9 }, { x: 0, z: 30, width: 8, depth: 9 }] }),
    async script({ play, sim, shot }) {
      await play(); await sim(0.9, { steer: 0 }); await shot('a', H);
      for (const k of ['b','c','d','e','f']) { await sim(0.2, { steer: 0 }); await shot(k, H); }
    } },
  { name: 'shop', skin: 'viking',
    async script({ p, shot }) {
      await p.click('#main nav div button:last-child'); await p.waitForSelector('#shop'); await shot('a', { wait: 800 });
      await p.click('#shop li:nth-child(10)'); await shot('b', { wait: 900 });
      await p.click('#shop aside [data-close]'); await p.click('#shop li:nth-child(7)'); await shot('c', { wait: 900 });
    } },
  { name: 'levels', skin: 'party',
    async script({ p, shot }) {
      await shot('menu', { wait: 600 });
      await p.click('#main nav div button:first-child'); await p.waitForSelector('#levels'); await shot('a', { wait: 800 });
    } },
];
