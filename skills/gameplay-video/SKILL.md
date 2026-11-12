---
name: gameplay-video
description: Make a vertical (9:16, 1080x1920) gameplay trailer of MobRise for mobile (YouTube Shorts, TikTok, Instagram Reels, store preview videos), recorded from the real game frame by frame, with captions, smooth transitions, the game's own sound effects, music and a thumbnail. Use when asked for a trailer, a gameplay video, a promo video, a Short or a video thumbnail of the game.
---

# Vertical gameplay video (trailer)

Builds a ~70 s vertical trailer from the real game, in English:

| Output (`dist/gameplay-video/`) | What |
|---|---|
| `mobrise-gameplay.mp4` | Final video: 1080x1920, 30 fps, H.264 + AAC, -14 LUFS |
| `thumbnail.png` | Vertical thumbnail 1080x1920 (real game shot + title) |
| `video.mp4`, `sfx.wav` | Intermediates: picture only, sound effects only |
| `frames/<clip>/` | Recorded frames and the sound log (`sfx.json`) of each clip |

## How it works

- `scripts/storyboard.mjs`: **the only file to edit**. The list of clips in order: a staged level or a real level, the input (steering, cannon aim, bot), the overlay (captions, finger, cards) and the transition into the clip. Every field is documented at the top.
- `scripts/record.mjs`: opens the dev server in headless Chrome at 540x960 CSS px @2x. The game loop is frozen and advanced by fixed 1/60 s steps, two per video frame, so the frames are deterministic and never drop. It screenshots every frame with the HTML overlay on top.
  - It reuses the harness of the `android-presentation` skill: `lib.mjs` (Chrome with GPU, paths) and `level()` (staged levels written to `public/levels/_promo/`, loaded with the dev-only `?level=`).
  - **Bot**: `bot: { file: 'level12.json' }` plays a real level. Before recording, a headless copy of the level (same skin, same time spent in the menu) is solved with the greedy look-ahead of `src/debug/levelBot.ts`. The real game then replays the pointer positions. Randomness differs a little between the copy and the real game, so expect a few more losses than the plan says. `bot: {}` steers a staged level the same way, which is the easy way to dodge saws and arrows.
  - **Sound**: the game's `audio` singleton (`src/audio/audio.ts`) gets a fake AudioContext whose clock is the video time. Every sound the game would play is logged with its time, rate and volume to `sfx.json`. Nothing is heard and nothing is lost to the frozen loop.
- `scripts/assemble.mjs`: chains the clips with ffmpeg `xfade`. It renders the sound effects at their exact time, with the game's own files and mix levels (read from `audio.ts`) and with the effects fading with the picture during transitions. It then adds the music, normalizes the loudness and copies the thumbnail.

## Workflow

Run everything from the project root.

1. Setup: `npm i --no-save playwright-core`. Start the dev server (`npm run dev`, port 5173), with the preview tool when available. Captures need headless Chrome with a GPU (`/usr/bin/google-chrome`, or `CHROME=<path>`).
2. Edit `scripts/storyboard.mjs` (see "Making a good mobile trailer" below).
3. Record, all clips or only some:
   ```bash
   node skills/gameplay-video/scripts/record.mjs
   node skills/gameplay-video/scripts/record.mjs gates,boss
   ```
   Real-level clips take 1–2 minutes each, because the bot plan is computed in the page. A full run takes about 12 minutes, so run it in the background.
4. **Look at the frames before assembling.** Build one contact sheet per clip and read it:
   ```bash
   magick montage dist/gameplay-video/frames/boss/{0000,0030,0060,0090,0119}.jpg -tile 5x -geometry 216x384+2+2 sheet.png
   ```
   Check:
   - the crowd survives (no "Level failed" panel, no counter crashing to 3);
   - the captions do not cover the action or the game UI;
   - the camera is not zoomed out by a huge crowd.
   The log also prints the phase and the crowd count every second.
5. Assemble:
   ```bash
   node skills/gameplay-video/scripts/assemble.mjs
   node skills/gameplay-video/scripts/assemble.mjs --music none
   node skills/gameplay-video/scripts/assemble.mjs --music track.mp3 --segments "6.25-43.95,83.05-" --music-volume 0.8
   ```
   The log prints the start time of each clip in the final video, which helps align music hits with shots.
6. Review the result: a timeline sheet (`ffmpeg -i dist/gameplay-video/mobrise-gameplay.mp4 -vf "fps=1,scale=120:213,tile=12x7" -frames:v 1 timeline.png`), the loudness (`ffmpeg -i … -af ebur128 -f null -`), and a few full-size frames around the transitions.

## Making a good mobile trailer

Structure that worked (each step is a block of clips in `storyboard.mjs`):

1. **Hook (0–3 s)**: the most impressive moment first, before any explanation. Example: 400 runners crashing into a red army, in slow motion (`speed: t => …`), with a question caption ("How BIG can your mob get?"). People decide to stay in the first 2 seconds.
2. **Concept (≈ 10 s)**: explain simply, one idea per shot. "SWIPE to steer your crowd" (with the animated finger), "Pick the BEST gates" (show the counter growing), "Recruit lost runners", "The BIGGER crowd wins!".
3. **The promise**: a full-screen "NO ADS" card over blurred gameplay. It is the game's strongest selling point, so place it right after the concept, when the viewer understands what the game is.
4. **Hype (≈ 40 s)**: one mechanic per shot (saws, arrows, jumps, flight, bosses, cannon combos, coins, skins with powers), then **real levels played by the bot**. They show authentic gameplay and the other color themes. Build to a climax ("×10 → 400 RUNNERS!").
5. **End card (≈ 4 s)**: icon, name, "NO ADS • FREE", "24 levels / 10 skins" chips, a pulsing "PLAY NOW!" (or "Coming soon").

Rules learned from user feedback (keep them):

- **Don't cut too fast.** Shots of about 1.5 s with 0.25 s transitions were judged abrupt and too quick. Use **3–6 s per shot** and **0.5–0.7 s transitions** (`zoomin`, `smoothleft`, `smoothup`, `circleopen`, `fade`, `fadewhite` before the end card). Hard cuts with white flashes were rejected.
- **At least a minute of video**, with plenty of real gameplay. Captions alone don't make a trailer.
- Captions pop in once the incoming transition is mostly done, and shrink out before the outgoing one (`cap()` handles both). Keep them short (2 lines, one yellow `<b>` keyword) and readable without sound, because most people watch muted.
- Every shot moves: a slow 2D push (`push()`), or a reverse zoom on hype shots.
- In English. The description and other languages are separate text.

Staging tips:

- The tips of the `android-presentation` skill apply (speed 10 units/s, steer −4…4, `noShields()`, contrasting skins against red enemies, moderate crowds near bosses).
- A failed stunt ruins a shot. Make staged obstacles forgiving: holes short enough for the skin's flight (wizard 0.9 s means a depth of 6.5 at speed 10), and jump holes ≤ 10 deep. When a clip shows losses, shorten it (`dur`) or change the level, then re-record only that clip.
- Bosses: fewer, stronger runners (110) against a weaker boss (hp 900) gives a readable fight. Huge crowds bury the boss.
- Real levels: `pre` ≈ z / speed seconds to reach a section. The level summary (`public/levels/*.json`: gates, holes, archers, bosses with their z) tells where the action is.
- Menus (`menu: true`) animate in real time: use `wait` and `actions`. Hidden from all frames: the coin header, the pause and settings buttons, and the gate "+N" popup.

## Music

- **Default**: the game's own music, `public/sounds/music.mp3`, "Riverside Ride" by Matthew Pablo, **CC-BY 3.0**. Attribution is required: add "Music: Riverside Ride by Matthew Pablo (CC-BY 3.0)" to the video description. `music2.mp3` ("Children's March Theme", CC0) needs no credit. See `public/sounds/CREDITS.md`.
- **Never take music from YouTube or a commercial soundtrack** (for example a Nintendo track) for a video that will be published: it gets claimed or blocked. If the user insists on such a track, keep that version private and say so clearly.
- **Cutting and jumping inside a track** (`--segments "a-b,c-"`): make the cut inside a natural break or decay of the music. Make the new part start on its quiet lead-in, so its first attack lands where the old part would have hit again. The rhythm then stays continuous. Find breaks and attacks with a loudness scan:
  ```bash
  ffmpeg -ss 40 -t 6 -i track.mp3 -af "aresample=8000,asetnsamples=400,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-" -f null - | grep RMS
  ```
  Each line is 50 ms: quiet dips are breaks, sudden jumps are attacks.
- **Hit points**: line a strong attack of the music up with the climax shot (for example "400 RUNNERS!"). Use the clip start times printed by `assemble.mjs` and the scan above, then shift the start of the first segment.
- Effects vs music: `--sfx-volume` / `--music-volume`. Pops and gate sounds sit on top; the result is loudness-normalized to -14 LUFS (YouTube / TikTok standard).

## Thumbnail

The `thumb` clip of the storyboard is a single PNG shot (720x1280 @1.5): the gold 400 mob facing the red army, with the game pushed down, and the icon, "MobRise", "Grow your MOB!" and a "NO ADS • FREE" pill on top. `assemble.mjs` exports it to `thumbnail.png` (1080x1920). Re-shoot only it with `record.mjs thumb`.

## YouTube description

Write it in English first, then the same in French below. Include:
- "Coming soon" or the store links;
- the contact email given by the user;
- the music credit if it is CC-BY;
- a few hashtags, most important first (`#MobRise #ComingSoon #MobileGame …`; add `#Shorts` for a Short).

Avoid emojis unless the user asks for them.
