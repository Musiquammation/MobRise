/**
 * Builds the final video from the recorded clips.
 *
 *   node skills/gameplay-video/scripts/assemble.mjs [options]
 *
 *   --music <file|none>     soundtrack (default: public/sounds/music.mp3, the game's
 *                           own music: "Riverside Ride" by Matthew Pablo, CC-BY 3.0,
 *                           credit it in the video description)
 *   --segments <list>       parts of the music to play, in seconds of the track,
 *                           joined with a 0.3 s crossfade: "6.25-43.95,83.05-"
 *                           (default "0-"; the music loops if it is too short)
 *   --music-volume <x>      default 0.7
 *   --sfx-volume <x>        game sound effects, default 1 (0 = none)
 *   --out <file>            default dist/gameplay-video/mobrise-gameplay.mp4
 *
 * Steps: 1. clips chained with ffmpeg xfade (video.mp4)
 *        2. the sound effects logged by record.mjs rendered at their exact
 *           time, with the game's mix and pitch (sfx.wav)
 *        3. music + effects mixed, loudness normalized to -14 LUFS, muxed.
 * Also copies the thumbnail (frames/thumb) to thumbnail.png.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { clips as all } from './storyboard.mjs';

const FPS = 30, RATE = 48000, MUSIC_XFADE = 0.3;
const ROOT = process.cwd();
const DIR = path.join(ROOT, 'dist/gameplay-video');
const FRAMES = path.join(DIR, 'frames');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const musicFile = arg('music', path.join(ROOT, 'public/sounds/music.mp3'));
const segments = arg('segments', '0-');
const musicVolume = +arg('music-volume', 0.7);
const sfxVolume = +arg('sfx-volume', 1);
const out = path.resolve(arg('out', path.join(DIR, 'mobrise-gameplay.mp4')));
const ffmpeg = args => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 30 });

// ---------- 1. Video ----------
const clips = all.filter(c => !c.thumb);
const lens = [], starts = [];
const vargs = [];
for (const c of clips) {
	const dir = path.join(FRAMES, c.name);
	if (!fs.existsSync(dir)) throw new Error(`clip "${c.name}" not recorded: run record.mjs ${c.name}`);
	lens.push(fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).length / FPS);
	vargs.push('-framerate', String(FPS), '-i', path.join(dir, '%04d.jpg'));
}
let graph = clips.map((c, i) => `[${i}:v]scale=1080:1920:flags=lanczos,setsar=1,fps=${FPS},settb=AVTB,format=yuv420p[c${i}]`).join(';');
let total = lens[0], prev = 'c0';
starts.push(0);
for (let i = 1; i < clips.length; i++) {
	const [type, d] = clips[i].tr ?? ['fade', 0.01];
	starts.push(total - d);
	graph += `;[${prev}][c${i}]xfade=transition=${type}:duration=${d}:offset=${(total - d).toFixed(3)}[x${i}]`;
	total += lens[i] - d;
	prev = `x${i}`;
}
const video = path.join(DIR, 'video.mp4');
ffmpeg([...vargs, '-filter_complex', graph, '-map', `[${prev}]`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
	'-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), video]);
console.log('video', total.toFixed(2), 's');
clips.forEach((c, i) => console.log(`  ${starts[i].toFixed(2).padStart(6)} s  ${c.name}`));

// ---------- 2. Sound effects ----------
// Files and mix levels are read from the game's audio module, so the video sounds like the game.
const src = fs.readFileSync(path.join(ROOT, 'src/audio/audio.ts'), 'utf8');
const block = name => src.match(new RegExp(`const ${name}[^=]*=\\s*{([\\s\\S]*?)\\n}`))?.[1] ?? '';
const SOUNDS = Object.fromEntries([...block('SOUNDS').matchAll(/^\s*(\w+):\s*\[([^\]]*)\]/gm)].map(m => [m[1], [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1])]));
const MIX = Object.fromEntries([...block('MIX').matchAll(/^\s*(\w+):\s*([\d.]+)/gm)].map(m => [m[1], +m[2]]));
const pcm = new Map();
const decode = f => {
	if (!pcm.has(f)) {
		const b = ffmpeg(['-i', path.join(ROOT, 'public/sounds', `${f}.mp3`), '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-']);
		pcm.set(f, new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4));
	}
	return pcm.get(f);
};
const mix = new Float32Array(Math.ceil((total + 1) * RATE));
let count = 0;
clips.forEach((c, i) => {
	const file = path.join(FRAMES, c.name, 'sfx.json');
	if (!fs.existsSync(file) || sfxVolume <= 0) return;
	const tin = i > 0 ? (clips[i].tr?.[1] ?? 0) : 0, tout = clips[i + 1]?.tr?.[1] ?? 0;
	for (const e of JSON.parse(fs.readFileSync(file, 'utf8'))) {
		if (e.t < 0 || e.t > lens[i]) continue;
		// Follow the picture through the crossfades.
		let g = 1;
		if (tin && e.t < tin) g *= e.t / tin;
		if (tout && e.t > lens[i] - tout) g *= (lens[i] - e.t) / tout;
		const files = SOUNDS[e.id] ?? [];
		if (!files.length || g <= 0) continue;
		const data = decode(files[Math.floor(Math.random() * files.length)]);
		const rate = e.rate * (1 + (Math.random() * 2 - 1) * e.detune);
		const gain = g * (MIX[e.id] ?? 0.5) * e.volume * sfxVolume;
		const at = Math.round((starts[i] + e.t) * RATE);
		for (let k = 0; ; k++) {
			const s = k * rate, j = Math.floor(s);
			if (j + 1 >= data.length || at + k >= mix.length) break;
			mix[at + k] += gain * (data[j] + (data[j + 1] - data[j]) * (s - j));
		}
		count++;
	}
});
const sfxWav = path.join(DIR, 'sfx.wav');
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + mix.byteLength, 4); hdr.write('WAVEfmt ', 8);
hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(3, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(RATE, 24);
hdr.writeUInt32LE(RATE * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(32, 34); hdr.write('data', 36); hdr.writeUInt32LE(mix.byteLength, 40);
fs.writeFileSync(sfxWav, Buffer.concat([hdr, Buffer.from(mix.buffer)]));
console.log('sound effects', count);

// ---------- 3. Music + mix ----------
const fade = `afade=t=in:d=0.25,afade=t=out:st=${(total - 2.2).toFixed(2)}:d=2.2`;
const aargs = ['-i', video, '-i', sfxWav];
let agraph = `[1:a]aformat=sample_rates=${RATE}:channel_layouts=stereo[fx]`;
if (musicFile !== 'none') {
	aargs.push('-stream_loop', '-1', '-i', musicFile);
	const segs = segments.split(',').map(s => s.split('-').map(x => x === '' ? null : +x));
	segs.forEach(([a, b], k) => { agraph += `;[2:a]atrim=start=${a}${b !== null ? `:end=${b}` : ''},asetpts=PTS-STARTPTS[m${k}]`; });
	let m = 'm0';
	for (let k = 1; k < segs.length; k++) { agraph += `;[${m}][m${k}]acrossfade=d=${MUSIC_XFADE}:c1=tri:c2=tri[mx${k}]`; m = `mx${k}`; }
	agraph += `;[${m}]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_rates=${RATE}:channel_layouts=stereo,volume=${musicVolume}[mu]`;
	agraph += `;[mu][fx]amix=inputs=2:normalize=0:duration=first`;
} else {
	agraph += `;[fx]atrim=0:${total.toFixed(3)}`;
}
agraph += `,${fade},alimiter=limit=0.9,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=${RATE}[a]`;
ffmpeg([...aargs, '-filter_complex', agraph, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
	'-t', total.toFixed(3), '-movflags', '+faststart', out]);
console.log('->', path.relative(ROOT, out));

const thumb = path.join(FRAMES, 'thumb', '0000.png');
if (fs.existsSync(thumb)) {
	ffmpeg(['-i', thumb, '-vf', 'scale=1080:1920:flags=lanczos', path.join(DIR, 'thumbnail.png')]);
	console.log('->', path.relative(ROOT, path.join(DIR, 'thumbnail.png')));
}
