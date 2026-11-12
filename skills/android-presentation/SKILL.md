---
name: android-presentation
description: Generate the Google Play store listing images for MobRise (phone, 7" and 10" tablet screenshots with captions, feature graphic, app icon) into dist/android-presentation. Use when asked to make, refresh or redo the Android / Play Store presentation images, screenshots, feature graphic or icon.
---

# Android presentation images (Google Play)

Builds every image of the Play Store listing from the real game, in English:

| Output (`dist/android-presentation/`) | Play Console slot | Size |
|---|---|---|
| `icon-512.png` (+ `icon-1024.png`) | App icon | 512×512, ≤ 1 MB |
| `feature-graphic-1024x500.png` | Feature graphic | 1024×500 |
| `phone/01…13-*.png` | Phone screenshots (upload 01–08) | 1080×1920 |
| `tablet-7in/01…08-*.png` | 7" tablet screenshots | 1920×1080 |
| `tablet-10in/01…08-*.png` | 10" tablet screenshots | 2560×1440 |
| `_raw/` | Intermediate captures (do not upload) | |

Full Play requirements: `references/store-specs.md`. Listing text template: `references/listing-text.md`.

## Goal of the images

- **Show the variety of gameplay**: one mechanic per image (gates, boss, army clash, saws and spikes, archers and wind, jump pads over the void, recruits, cannon combo, skins with powers, level select).
- **Say "No forced ads"**: a pill on the first image, on the feature graphic and on a dedicated image.
- **Effective and fun**: a short, punchy two-line headline with one yellow keyword, a saturated background (a different color per image), and the game shot in a tilted device frame. Put the strongest hook first. Play mostly shows the first 3 images.

## Workflow

Run everything from the project root.

### 1. Setup

```bash
npm i --no-save playwright-core
```

Start the dev server with `npm run dev` (port 5173), using the preview tool when available. Captures need headless Chrome with a GPU (`/usr/bin/google-chrome`, or set `CHROME=<path>`).

### 2. Stage and capture gameplay

`scripts/scenes.mjs` defines one scene per mechanic. A scene has a save (equipped skin, all skins owned, coins), a tiny staged level built around one mechanic, and a script that steps the game frame by frame and takes several shots (`a`, `b`, `c`…) of the same moment.

```bash
node skills/android-presentation/scripts/capture.mjs phone
node skills/android-presentation/scripts/capture.mjs tablet
node skills/android-presentation/scripts/capture.mjs phone boss,army   # only some scenes
```

How the harness works (`scripts/harness.mjs`):
- It uses the dev-only hooks `window.mobrise` (the App) and `?level=<file>`. Staged levels go to `public/levels/_promo/` and are deleted afterwards.
- The game loop is frozen. `sim(seconds, { steer: x })` advances fixed 1/60 s steps, so shots are deterministic. `aim: { box: i }` aims the cannon at a box to build combos.
- `env.js` is replaced so there is no FPS overlay, and the pixel-ratio cap is lifted so shots are sharp.

**Always look at the shots before choosing.** Build a contact sheet (for example `magick montage dist/android-presentation/_raw/phone/*.png -tile 8x -geometry 240x427+3+3 sheet.png`) and read it. Then fix the scenes and capture again. Typical fixes are in "Staging tips" below.

When the game gains a mechanic, add a scene for it. `src/data/Level.ts` lists every level field. If a level requires a specific skin's power, show it with that skin equipped (example: `flight` with the wizard skin).

### 3. Render the framed images

Edit `scripts/slides.mjs`: the text, palette and chosen raw shot of each image, in upload order, plus the feature graphic config. Then render:

```bash
node skills/android-presentation/scripts/render.mjs          # everything
node skills/android-presentation/scripts/render.mjs phone/01 # one image
```

The templates live in `render.mjs`. Titles shrink automatically to fit. Tablet slides use a landscape layout: text on the left, a tablet frame with the tablet capture on the right.

### 4. Icon

```bash
node skills/android-presentation/scripts/icon/render-icon.mjs
```

The icon is **not a screenshot**. It is a dedicated three.js scene, `scripts/icon/iconScene.ts`, served by the dev server at `/skills/android-presentation/scripts/icon/index.html?<query>`. It uses toon shading, ink outlines and depth fog. The validated design is the default query in `render-icon.mjs`: a golden King with the game's blocky proportions, fist up, in front of a rising tide of 1300 blue runners, with the sun rising behind his crown on a purple sky.

To explore a variant without overwriting the icon:
`node …/render-icon.mjs test "ks=1.85&cy=26"` writes `icon-test-1024.png` and `icon-test-512.png`.

### 5. Check and review

```bash
node skills/android-presentation/scripts/check.mjs
```

It checks dimensions, ratios, weights and counts against the Play rules. Then **view the images yourself** (contact sheet), and test the icon at 96 px and 48 px next to competitor icons, with rounded-corner masks.

### 6. Upload (only if asked)

In the Play Console (Grow > Store presence > Main store listing): replace assets through "Ajouter des composants" > Importer. Use a distinct file name when replacing an asset, because the library keeps the old file under its original name. Never click save, send for review or publish without the user's explicit OK.

## Design rules learned (keep them)

- **Icon characters stay blocky**, with the game's proportions. The user rejected rounded "figurine" characters and a jointed rig with elbows and knees as worse.
- **No per-block outlines on the hero** when outlines matter at full size. Inverted-hull outlines per rounded box leave dark slits where blocks meet. `?sil=<px>&ko=0` draws a single silhouette outline instead. The user still kept the original look, so use this only when asked.
- Gold king against a blue crowd on a purple sky gives the strongest contrast. A gold crown needs a lighter shade than the gold body.
- Competitors (Count Masters–style) all use smooth stickmen on blue or orange with ×N gates. Stand out with the voxel style, an expressive leader and a non-blue palette.
- In-game shots: avoid shield bubbles on close-ups (`noShields()`), and hide the gate "+0" popup at start (`shot(name, { hideMark: true })`). Use a contrasting skin against red enemies (blue or ninja, not red). Keep crowds moderate (60–150) when a boss or object must stay visible, because a big crowd zooms the camera out.

## Staging tips

- Steering is set with `steer` = track x (−4…4). Crowd edges can still touch the neighbour gate: aim at the gate's inner half.
- Speed is 10 units/s: an object at z=20 is reached after ~2 s from the start.
- Bosses get buried in big crowds. Make the boss bigger in `src/game/entities/enemies/Boss.ts` (`SCALE`) if needed, but only on a throwaway branch.
- Cannon: `level({ length: 12, cannon: { distance: 14, height: 5.5, … } })` brings the boxes closer to the camera.
- Win screen: `sim(30, { aim: { box: 0 } })`, then `shot('a', { wait: 1200, css: '#game > i{display:none!important}' })` to hide the crosshair.

## Performance warning

The icon scene draws ~1300 characters. Geometries are cached and shared (`rounded()` in `iconScene.ts`): never create one geometry per box, because that crashed the machine once. Keep `n` ≤ 1500 and render one icon at a time.
