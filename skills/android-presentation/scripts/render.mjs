/**
 * Builds the final store images from the raw captures, with HTML templates
 * rendered in headless Chrome (game font, colored rays background, tilted
 * device frame, outlined headline, "No forced ads" pill).
 *
 *   node skills/android-presentation/scripts/render.mjs [filter]
 *
 * Slides (texts, colors, which raw shot) are listed in slides.mjs.
 * Output: dist/android-presentation/{phone,tablet-7in,tablet-10in}/*.png
 *         dist/android-presentation/feature-graphic-1024x500.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { OUT, RAW, ROOT, launch, mkdir } from './lib.mjs';
import { PHONE, TABLET, FEATURE } from './slides.mjs';

const FONT = `file://${ROOT}/node_modules/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2`;
/** Raw shot path: "phone/gates-f.png" -> file URL in _raw. */
const img = (f) => `file://${path.join(RAW, f)}`;

const outline = (r, c = '#1d2540', drop = 0) => {
  const s = [];
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; s.push(`${(Math.cos(a) * r).toFixed(1)}px ${(Math.sin(a) * r).toFixed(1)}px 0 ${c}`); }
  if (drop) s.push(`0 ${r + drop}px 0 ${c}`, `0 ${r + drop + 6}px ${drop * 3}px rgba(0,0,0,.25)`);
  return s.join(',');
};

const BASE_CSS = `
@font-face { font-family: Lilita; src: url(${FONT}); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body { font-family: Lilita, sans-serif; color: #fff; position: relative; background: var(--c1); }
.bg { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 62%, var(--c2) 0%, var(--c1) 55%, var(--c3) 100%); }
.rays { position: absolute; left: 50%; top: 62%; width: 300vmax; height: 300vmax; transform: translate(-50%, -50%);
  background: repeating-conic-gradient(rgba(255,255,255,.10) 0 7.5deg, rgba(255,255,255,0) 7.5deg 15deg);
  -webkit-mask: radial-gradient(circle, #000 0%, rgba(0,0,0,.6) 25%, transparent 50%); }
.dots { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.18) 3px, transparent 3.5px); background-size: 46px 46px;
  -webkit-mask: linear-gradient(#000, transparent 35%); }
.title { position: absolute; text-align: center; line-height: .95; letter-spacing: 1px; text-transform: uppercase; }
.title b { color: #ffd23f; font-weight: 400; }
.sub { position: absolute; text-align: center; line-height: 1.1; color: #fff; }
.device { position: absolute; background: #1d2540; box-shadow: 0 40px 80px rgba(10,15,40,.45), inset 0 0 0 4px #3a4470; }
.device .screen { position: absolute; overflow: hidden; background: #8fd0f7; }
.device .screen img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sticker { position: absolute; display: flex; align-items: center; justify-content: center; text-align: center; text-transform: uppercase; line-height: .9; }
.noads { background: #fff; color: #1d2540; border: 8px solid #1d2540; border-radius: 999px; box-shadow: 0 10px 0 #1d2540, 0 20px 40px rgba(0,0,0,.3); gap: 18px; }
.noads svg { flex: none; }
`;
const noAdsIcon = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#ff4757" stroke="#1d2540" stroke-width="7"/><path fill="#fff" d="M24 66 L34 34 H44 L54 66 H45 L43 59 H35 L33 66 Z M37 52 H41 L39 44 Z"/><path fill="#fff" d="M57 34 H66 C75 34 80 41 80 50 C80 59 75 66 66 66 H57 Z M65 42 V58 H66 C69 58 71 55 71 50 C71 45 69 42 66 42 Z"/><line x1="20" y1="80" x2="80" y2="20" stroke="#1d2540" stroke-width="16" stroke-linecap="round"/><line x1="20" y1="80" x2="80" y2="20" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>`;
const noAdsPill = (scale, extra = '') => `<div class="sticker noads" style="${extra}; padding:${18*scale}px ${40*scale}px ${18*scale}px ${22*scale}px; font-size:${56*scale}px; border-width:${8*scale}px; box-shadow: 0 ${10*scale}px 0 #1d2540, 0 ${20*scale}px ${40*scale}px rgba(0,0,0,.3)">${noAdsIcon(90*scale)}<span>No forced ads</span></div>`;

const PAL = {
  blue: ['#2f7cf6', '#7fc8ff', '#1846b8'], red: ['#e8334a', '#ff9a6b', '#9c1230'], orange: ['#ff8a1f', '#ffd36b', '#d24f00'],
  purple: ['#7b3fe4', '#c59bff', '#3f1a99'], green: ['#20b45a', '#9ff07d', '#0b7a3a'], yellow: ['#ffb000', '#fff08a', '#e06a00'],
  pink: ['#e9408f', '#ffb0d6', '#9b1660'], indigo: ['#4b4fe0', '#a7b4ff', '#22258f'], teal: ['#10a5b5', '#8ff2e6', '#06607a'],
  sky: ['#1e9be8', '#a5e6ff', '#0c5fb0'], lime: ['#6cc11f', '#e2ff8a', '#2f7d06'],
};
const vars = (p) => `--c1:${PAL[p][0]};--c2:${PAL[p][1]};--c3:${PAL[p][2]}`;

// ---------------------------------------------------------------- phone slide (1080x1920)
function phone(s) {
  const W = 740, H = Math.round(W * 693 / 390), bez = 26;
  const top = s.top ?? 560;
  return `<html><head><style>${BASE_CSS}</style></head><body style="${vars(s.pal)}">
  <div class="bg"></div><div class="rays"></div><div class="dots"></div>
  <div class="head" style="position:absolute;left:50px;right:50px;top:90px;height:440px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px">
  <div class="title fit" style="position:relative;white-space:nowrap;font-size:${s.size ?? 136}px;text-shadow:${outline(10, '#1d2540', 8)};transform:rotate(-2.5deg)">${s.title}</div>
  <div class="sub" style="position:relative;font-size:52px;text-shadow:${outline(5, 'rgba(29,37,64,.9)', 3)}">${s.sub ?? ''}</div></div>
  <div class="device" style="left:${(1080 - W - bez * 2) / 2}px;top:${top}px;width:${W + bez * 2}px;height:${H + bez * 2}px;border-radius:96px;transform:rotate(${s.rot ?? 2.5}deg)">
    <div class="screen" style="left:${bez}px;top:${bez}px;width:${W}px;height:${H}px;border-radius:72px"><img src="${img(s.img)}"></div>
  </div>
  ${s.noads ? noAdsPill(1, `left:${s.noadsX ?? 330}px;top:${s.noadsY ?? 1640}px;transform:rotate(-6deg)`) : ''}
  ${s.extra ?? ''}
  </body></html>`;
}

// ---------------------------------------------------------------- tablet slide (1920x1080 css)
function tablet(s) {
  const H = 900, W = Math.round(H * 768 / 1024), bez = 30;
  return `<html><head><style>${BASE_CSS}
  .rays{left:72%;top:50%} .bg{background:radial-gradient(ellipse at 72% 50%, var(--c2) 0%, var(--c1) 50%, var(--c3) 100%)}</style></head><body style="${vars(s.pal)}">
  <div class="bg"></div><div class="rays"></div><div class="dots"></div>
  <div class="head" style="position:absolute;left:80px;width:880px;top:${s.noads ? 110 : 160}px;height:640px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:36px">
  <div class="title fit" style="position:relative;white-space:nowrap;text-align:left;font-size:${s.size ?? 136}px;text-shadow:${outline(10, '#1d2540', 8)};transform:rotate(-2deg);transform-origin:left center">${s.title}</div>
  <div class="sub" style="position:relative;font-size:56px;text-align:left;text-shadow:${outline(5, 'rgba(29,37,64,.9)', 3)}">${s.sub ?? ''}</div></div>
  <div class="device" style="left:${1050}px;top:${(1080 - H - bez * 2) / 2 + 10}px;width:${W + bez * 2}px;height:${H + bez * 2}px;border-radius:64px;transform:rotate(${s.rot ?? 3}deg)">
    <div class="screen" style="left:${bez}px;top:${bez}px;width:${W}px;height:${H}px;border-radius:36px"><img src="${img(s.img)}"></div>
  </div>
  ${s.noads ? noAdsPill(0.95, `left:80px;top:${s.noadsY ?? 830}px;transform:rotate(-4deg)`) : ''}
  ${s.extra ?? ''}
  </body></html>`;
}

// ---------------------------------------------------------------- feature graphic (1024x500)
function feature() {
  const ph = (f, x, y, r, w) => { const h = Math.round(w * 693 / 390), b = 10; return `<div class="device" style="left:${x}px;top:${y}px;width:${w + 2 * b}px;height:${h + 2 * b}px;border-radius:38px;transform:rotate(${r}deg);box-shadow:0 20px 40px rgba(10,15,40,.45), inset 0 0 0 2px #3a4470"><div class="screen" style="left:${b}px;top:${b}px;width:${w}px;height:${h}px;border-radius:28px"><img src="${img(f)}"></div></div>`; };
  return `<html><head><style>${BASE_CSS}.rays{left:72%;top:60%}.bg{background:radial-gradient(ellipse at 70% 60%, var(--c2) 0%, var(--c1) 50%, var(--c3) 100%)}</style></head><body style="${vars('blue')}">
  <div class="bg"></div><div class="rays"></div><div class="dots" style="background-size:24px 24px;background-image:radial-gradient(rgba(255,255,255,.18) 1.6px, transparent 2px)"></div>
  ${ph(FEATURE.left, 600, 130, -10, 180)}
  ${ph(FEATURE.right, 850, 120, 10, 180)}
  ${ph(FEATURE.center, 712, 64, 0, 210)}
  <div class="title" style="left:40px;width:560px;top:80px;font-size:118px;text-transform:none;text-shadow:${outline(7, '#1d2540', 7)};transform:rotate(-4deg)">MobRise</div>
  <div class="sub" style="left:40px;width:560px;top:250px;font-size:40px;text-shadow:${outline(4, '#1d2540', 3)}">${FEATURE.tagline}</div>
  ${noAdsPill(0.5, 'left:150px;top:380px;transform:rotate(-4deg)')}
  </body></html>`;
}

const jobs = [];
const P = (n, s) => jobs.push({ file: `phone/${n}.png`, w: 1080, h: 1920, dpr: 1, html: phone(s) });
const T = (n, s) => { jobs.push({ file: `tablet-7in/${n}.png`, w: 1920, h: 1080, dpr: 1, html: tablet(s) }); jobs.push({ file: `tablet-10in/${n}.png`, w: 1920, h: 1080, dpr: 4 / 3, html: tablet(s) }); };

for (const [name, slide] of PHONE) P(name, slide);
for (const [name, slide] of TABLET) T(name, slide);
jobs.push({ file: 'feature-graphic-1024x500.png', w: 1024, h: 500, dpr: 1, html: feature() });

const only = process.argv[2];
const b = await launch();
const tmpDir = mkdir(path.join(RAW, 'tpl'));
for (const j of jobs) {
  if (only && !j.file.includes(only)) continue;
  const ctx = await b.newContext({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: j.dpr });
  const p = await ctx.newPage();
  const tmp = path.join(tmpDir, 'slide.html'); fs.writeFileSync(tmp, j.html);
  await p.goto('file://' + tmp); await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => { for (const el of document.querySelectorAll('.fit')) { const max = el.parentElement.clientWidth; let f = parseFloat(getComputedStyle(el).fontSize); while (el.scrollWidth > max && f > 40) { f -= 2; el.style.fontSize = f + 'px'; } } }); await p.waitForTimeout(150);
  const dest = path.join(OUT, j.file); mkdir(path.dirname(dest));
  await p.screenshot({ path: dest, type: 'png' });
  await ctx.close();
  console.log('rendered', j.file);
}
await b.close();
