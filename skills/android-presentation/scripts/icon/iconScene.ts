/**
 * Icon lab: stylized 3D scenes for the store icon, built from the same blocky
 * characters as the game (src: scripts/genModels.mjs) but posable, with toon
 * shading and outlines so they read at 48 px.
 *
 * Open /draft/icon/index.html?c=<concept> on the dev server.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const params = new URLSearchParams(location.search);
const concept = params.get("c") ?? "charge";
const SIZE = Number(params.get("size") ?? 512);

// ------------------------------------------------------------------ materials

const gradient = (() => {
	const data = new Uint8Array([90, 170, 255]);
	const t = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
	t.minFilter = t.magFilter = THREE.NearestFilter;
	t.needsUpdate = true;
	return t;
})();

const mats = new Map<string, THREE.Material>();
function toon(color: string, emissive = 0): THREE.Material {
	const key = color + emissive;
	if (!mats.has(key)) {
		const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient });
		if (emissive) { m.emissive = new THREE.Color(color); m.emissiveIntensity = emissive; }
		mats.set(key, m);
	}
	return mats.get(key)!;
}
const INK = "#141a33";
/** Roundness multiplier of every box (1 = the game's sharp blocks). */
const ROUND = Number(params.get("round") ?? 1);
/** Head scale (bigger = cuter). */
const HEAD = Number(params.get("hs") ?? 1);
const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

/** Shared geometries: every runner reuses the same few rounded boxes. */
const geoCache = new Map<string, THREE.BufferGeometry>();
function rounded(w: number, h: number, d: number, r: number) {
	const key = [w, h, d, r].map(v => v.toFixed(4)).join();
	let g = geoCache.get(key);
	if (!g) geoCache.set(key, g = new RoundedBoxGeometry(w, h, d, 3, r));
	return g;
}

/** Rounded box with an inverted-hull outline. */
function box(w: number, h: number, d: number, color: string | THREE.Material, pos: [number, number, number], o = 0.03, r = 0.035): THREE.Group {
	const g = new THREE.Group();
	const rr = Math.min(r * ROUND, w / 2.05, h / 2.05, d / 2.05);
	const mesh = new THREE.Mesh(rounded(w, h, d, rr), typeof color === "string" ? toon(color) : color);
	mesh.castShadow = true;
	g.add(mesh);
	if (o > 0) g.add(new THREE.Mesh(rounded(w + o * 2, h + o * 2, d + o * 2, rr + o), outlineMat));
	g.position.set(...pos);
	return g;
}

// ------------------------------------------------------------------ characters

type Pose = {
	/** Shoulder rotations (x: swing forward(-)/back(+), z: raise sideways). */
	armL?: [number, number]; armR?: [number, number];
	legL?: number; legR?: number;
	lean?: number; headTilt?: number; yaw?: number; bob?: number;
	headTurn?: number; headRoll?: number; twist?: number;
};
type GuyOptions = {
	cape?: string;
	color: string; hat?: "crown" | "viking" | "wizard" | "party" | null;
	face?: "plain" | "shout" | "happy"; pose?: Pose; o?: number;
};

function shade(color: string, k: number) {
	return "#" + new THREE.Color(color).multiplyScalar(k).getHexString();
}

/** Same proportions as the game's player (origin at the feet, facing -Z). */
function guy({ color, hat = null, face = "plain", pose = {}, o = 0.028, cape }: GuyOptions): THREE.Group {
	const root = new THREE.Group();
	const body = new THREE.Group();
	body.position.y = (pose.bob ?? 0);
	root.add(body);

	const leg = (side: number, a: number) => {
		const pivot = new THREE.Group();
		pivot.position.set(side * 0.09, 0.36, 0);
		pivot.add(box(0.14, 0.38, 0.16, shade(color, 0.85), [0, -0.18, 0], o));
		pivot.rotation.x = a;
		body.add(pivot);
	};
	leg(-1, pose.legL ?? 0);
	leg(1, pose.legR ?? 0);

	const torso = new THREE.Group();
	torso.position.y = 0.36;
	torso.rotation.set(-(pose.lean ?? 0), pose.twist ?? 0, 0, "YXZ");
	body.add(torso);
	torso.add(box(0.42, 0.42, 0.26, color, [0, 0.2, 0], o));

	if (cape) {
		// Royal cape: segments hanging from the shoulders, flaring backward.
		let parent: THREE.Object3D = torso;
		const seg = 0.2;
		const pivot0 = new THREE.Group();
		pivot0.position.set(0, 0.4, 0.15);
		torso.add(pivot0);
		parent = pivot0;
		for (let i = 0; i < 5; i++) {
			const w = 0.5 + i * 0.07;
			const p = new THREE.Group();
			p.rotation.x = i === 0 ? -0.5 : -0.25;
			parent.add(p);
			p.add(box(w, seg + 0.02, 0.04, i % 2 ? cape : shade(cape, 0.92), [0, -seg / 2, 0], o * 0.8, 0.015));
			const next = new THREE.Group();
			next.position.y = -seg;
			p.add(next);
			parent = next;
		}
		// Gold collar.
		torso.add(box(0.46, 0.06, 0.3, "#ffc928", [0, 0.41, 0.01], o * 0.8, 0.02));
	}

	const arm = (side: number, [ax, az]: [number, number]) => {
		const pivot = new THREE.Group();
		pivot.position.set(side * 0.27, 0.37, 0);
		pivot.add(box(0.11, 0.36, 0.13, color, [0, -0.15, 0], o));
		// fist
		pivot.add(box(0.13, 0.11, 0.14, shade(color, 1.08), [0, -0.33, 0], o * 0.9));
		pivot.rotation.set(ax, 0, side * az, "ZXY");
		torso.add(pivot);
	};
	arm(-1, pose.armL ?? [0, 0.08]);
	arm(1, pose.armR ?? [0, 0.08]);

	const head = new THREE.Group();
	head.position.y = 0.42;
	head.rotation.set(pose.headTilt ?? 0, pose.headTurn ?? 0, pose.headRoll ?? 0, "YXZ");
	head.scale.setScalar(HEAD);
	torso.add(head);
	head.add(box(0.36, 0.32, 0.32, color, [0, 0.16, 0], o, 0.05));

	// Face (on -Z).
	const fz = -0.165;
	const eyeY = face === "shout" ? 0.2 : 0.19;
	for (const s of [-1, 1]) {
		head.add(box(0.1, 0.1, 0.02, "#ffffff", [s * 0.08, eyeY, fz], 0, 0.01));
		head.add(box(0.05, 0.065, 0.02, INK, [s * 0.08 + (face === "shout" ? 0 : 0), eyeY - 0.01, fz - 0.012], 0, 0.01));
		if (face === "shout") head.add(box(0.022, 0.022, 0.01, "#ffffff", [s * 0.08 - 0.012, eyeY + 0.008, fz - 0.026], 0, 0.004));
		if (face === "shout") {
			// Angry brows, angled down toward the middle.
			const brow = box(0.12, 0.035, 0.03, INK, [s * 0.085, eyeY + 0.08, fz - 0.01], 0, 0.01);
			brow.rotation.z = s * 0.38;
			head.add(brow);
		}
	}
	if (face === "shout") {
		head.add(box(0.15, 0.085, 0.02, "#5a0f1f", [0, 0.065, fz - 0.002], 0, 0.02));
		head.add(box(0.11, 0.025, 0.02, "#ffffff", [0, 0.095, fz - 0.01], 0, 0.008));
		head.add(box(0.08, 0.03, 0.02, "#ff6b81", [0, 0.04, fz - 0.01], 0, 0.01));
	} else if (face === "happy") {
		head.add(box(0.12, 0.05, 0.02, "#5a0f1f", [0, 0.075, fz - 0.002], 0, 0.02));
	}

	// Hats: origin = top of the head (y = 0.32 in head space).
	const top = 0.32;
	if (hat === "crown") {
		const g = params.get("crown") ?? "#ffc928";
		head.add(box(0.4, 0.11, 0.36, g, [0, top + 0.055, 0], o));
		for (const [x, z] of [[-0.15, -0.13], [0.15, -0.13], [-0.15, 0.13], [0.15, 0.13], [0, -0.13]])
			head.add(box(0.08, 0.13, 0.08, g, [x, top + 0.16, z], o * 0.8, 0.02));
		// Little gold balls on the prongs.
		for (const [x, z] of [[-0.15, -0.13], [0.15, -0.13], [0, -0.13]])
			head.add(box(0.06, 0.06, 0.06, "#fff3b0", [x, top + 0.25, z], o * 0.6, 0.03));
		head.add(box(0.08, 0.08, 0.03, "#ff3355", [0, top + 0.055, -0.19], 0, 0.02));
		for (const s of [-1, 1]) head.add(box(0.05, 0.05, 0.03, "#38bdf8", [s * 0.12, top + 0.055, -0.19], 0, 0.015));
	} else if (hat === "viking") {
		head.add(box(0.4, 0.14, 0.36, "#9aa3b5", [0, top + 0.05, 0], o));
		for (const s of [-1, 1]) {
			const horn = box(0.08, 0.22, 0.08, "#fff3d6", [s * 0.26, top + 0.12, 0], o * 0.8, 0.03);
			horn.rotation.z = -s * 0.6;
			head.add(horn);
		}
	} else if (hat === "party") {
		const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 16), toon("#ff4fa3"));
		cone.position.y = top + 0.18;
		head.add(cone);
	}

	root.rotation.y = pose.yaw ?? 0;
	return root;
}

// ------------------------------------------------------------------ jointed rig (the king)

/**
 * Angles in radians. Legs / arms: positive x = toward the front (-Z).
 * Knees bend backward (negative), elbows forward (positive).
 * Shoulder z = raise sideways.
 */
type RigPose = {
	thighL: number; kneeL: number; thighR: number; kneeR: number;
	shoulderL: [number, number]; elbowL: number; shoulderR: [number, number]; elbowR: number;
	lean: number; twist: number; hipTwist: number; headTilt: number; headTurn: number; headRoll: number; yaw: number; bob: number;
};

/**
 * Same blocky style as the game, but with elbows, knees, a waist, a neck and
 * a chest wider than the hips, so a pose reads as a real movement.
 */
function rig(color: string, pose: RigPose, o: number, mat: "toon" | "std"): THREE.Group {
	const m = (c: string) => mat === "std"
		? new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0 })
		: toon(c);
	const B = (w: number, h: number, d: number, c: string, p: [number, number, number], oo = o, r = 0.035) => box(w, h, d, m(c), p, oo, r);
	const dark = shade(color, 0.86), light = shade(color, 1.06);

	const root = new THREE.Group();
	const hips = new THREE.Group();
	hips.position.y = 0.4 + pose.bob;
	hips.rotation.y = pose.hipTwist;
	root.add(hips);
	hips.add(B(0.34, 0.14, 0.21, color, [0, 0, 0], 0));

	const leg = (side: number, thigh: number, knee: number) => {
		const hip = new THREE.Group();
		hip.position.set(side * 0.09, -0.02, 0);
		hip.rotation.x = thigh;
		hips.add(hip);
		hip.add(B(0.145, 0.2, 0.16, dark, [0, -0.1, 0]));
		const k = new THREE.Group();
		k.position.y = -0.19;
		k.rotation.x = knee;
		hip.add(k);
		k.add(B(0.13, 0.2, 0.145, dark, [0, -0.095, 0]));
		// Foot, a bit longer toward the toes.
		k.add(B(0.14, 0.07, 0.21, shade(color, 0.72), [0, -0.19, -0.035], o, 0.03));
	};
	leg(-1, pose.thighL, pose.kneeL);
	leg(1, pose.thighR, pose.kneeR);

	const spine = new THREE.Group();
	spine.position.y = 0.05;
	spine.rotation.set(-pose.lean, pose.twist - pose.hipTwist, 0, "YXZ");
	hips.add(spine);
	// Waist then chest (wider at the shoulders).
	// Waist then chest (wider at the shoulders), no inner outline: one silhouette.
	spine.add(B(0.34, 0.2, 0.21, color, [0, 0.07, 0], 0));
	spine.add(B(0.44, 0.25, 0.26, color, [0, 0.27, 0], o, 0.05));
	// Outline of the waist + hips, drawn behind (so no seam line on the belly).
	const lower = new THREE.Mesh(rounded(0.34 + 2 * o, 0.36 + 2 * o, 0.21 + 2 * o, 0.035 + o), outlineMat);
	lower.position.y = -0.04;
	spine.add(lower);

	const arm = (side: number, [sx, sz]: [number, number], elbow: number) => {
		const sh = new THREE.Group();
		sh.position.set(side * 0.27, 0.34, 0);
		sh.rotation.set(sx, 0, side * sz, "ZXY");
		spine.add(sh);
		sh.add(B(0.12, 0.2, 0.13, color, [0, -0.08, 0], o, 0.04));
		const el = new THREE.Group();
		el.position.y = -0.18;
		el.rotation.x = elbow;
		sh.add(el);
		el.add(B(0.105, 0.17, 0.115, color, [0, -0.075, 0]));
		el.add(B(0.14, 0.13, 0.15, light, [0, -0.2, 0], o * 0.9, 0.04));
	};
	arm(-1, pose.shoulderL, pose.elbowL);
	arm(1, pose.shoulderR, pose.elbowR);

	// Neck + head (same head and face as the game, see guy()).
	spine.add(B(0.16, 0.08, 0.15, dark, [0, 0.41, 0], 0, 0.02));
	const headPivot = new THREE.Group();
	headPivot.position.y = 0.42;
	headPivot.rotation.set(pose.headTilt, pose.headTurn, pose.headRoll, "YXZ");
	spine.add(headPivot);
	const face = guy({ color, hat: "crown", face: "shout", o });
	// Keep only the head of a regular guy: it is the last child of its torso.
	const torso = face.children[0].children[2] as THREE.Group;
	const head = torso.children[torso.children.length - 1];
	head.position.set(0, -0.02, 0);
	head.traverse(n => {
		const mesh = n as THREE.Mesh;
		if (mat === "std" && mesh.isMesh && mesh.material !== outlineMat) {
			const c = (mesh.material as THREE.MeshToonMaterial).color;
			if (c) mesh.material = m("#" + c.getHexString());
		}
	});
	headPivot.add(head);

	root.rotation.y = pose.yaw;
	return root;
}

/** Random running pose (stride phase t in [0, 1)). */
function runPose(t: number, extra: Partial<Pose> = {}): Pose {
	const s = Math.sin(t * Math.PI * 2);
	return {
		legL: s * 0.7, legR: -s * 0.7,
		armL: [-s * 0.9, 0.12], armR: [s * 0.9, 0.12],
		lean: 0.18, bob: Math.abs(s) * 0.04, ...extra,
	};
}

// Deterministic random.
let seed = Number(params.get("seed") ?? 7);
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// ------------------------------------------------------------------ scene

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(SIZE, SIZE);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
if (params.get("tm")) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = Number(params.get("tm")); }
document.getElementById("stage")!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
/** The leader, outlined as one silhouette when ?sil=<px> is set. */
let hero: THREE.Object3D | null = null;
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

function lights(keyColor = "#fff1d6", rimColor = "#bfe9ff", rimIntensity = 2.2) {
	scene.add(new THREE.HemisphereLight("#ffffff", "#8a7fb0", 1.4));
	const key = new THREE.DirectionalLight(keyColor, 2.4);
	key.position.set(-4, 7, -8);
	key.castShadow = true;
	key.shadow.mapSize.set(2048, 2048);
	Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 60 });
	key.shadow.bias = -0.0005;
	scene.add(key);
	const rim = new THREE.DirectionalLight(rimColor, rimIntensity);
	rim.position.set(5, 4, 10);
	scene.add(rim);
}

/** Running track, like in game (white with light stripes), fading in the distance via fog. */
function track(width = 7, length = 60, color = "#f4f7ff", stripe = "#dfe8fb") {
	const g = new THREE.Group();
	const n = 30;
	for (let i = 0; i < n; i++) {
		const d = length / n;
		const m = new THREE.Mesh(new THREE.BoxGeometry(width, 0.4, d), toon(i % 2 ? color : stripe));
		m.position.set(0, -0.2, -4 + i * d + d / 2);
		m.receiveShadow = true;
		g.add(m);
	}
	scene.add(g);
	return g;
}

const BLUE = "#3b82f6";

const concepts: Record<string, () => void> = {
	/** A: the king charges toward you, a tide of runners behind him. */
	charge() {
		lights();
		track(9, 80);
		scene.fog = new THREE.Fog("#ffd27a", 12, 34);
		const king = guy({ color: BLUE, hat: "crown", face: "shout", o: 0.03, pose: {
			legL: 0.75, legR: -0.6, armR: [-0.4, 2.55], armL: [0.9, 0.25], lean: 0.12, headTilt: -0.12, yaw: 0.25,
		} });
		king.scale.setScalar(1.9);
		king.position.set(-0.05, 0, -0.4);
		scene.add(king);
		for (let i = 0; i < 260; i++) {
			const z = 1.2 + Math.pow(rand(), 0.8) * 26;
			const spread = 1.2 + z * 0.33;
			const x = (rand() * 2 - 1) * Math.min(4.3, spread);
			if (Math.abs(x) < 0.9 && z < 2.2) continue;
			const g = guy({ color: rand() < 0.08 ? "#5b9bff" : BLUE, pose: runPose(rand(), { yaw: (rand() - 0.5) * 0.4 }) });
			g.scale.setScalar(1.05);
			g.position.set(x, 0, z);
			scene.add(g);
		}
		camera.fov = 42;
		camera.position.set(0.9, 1.3, -4.6);
		camera.lookAt(0.05, 1.95, 4);
	},

	/** E: the mob rises like a tide on a hill behind the king. */
	rise() {
		lights();
		const slope = Number(params.get("slope") ?? 0.42);
		const ang = Math.atan(slope);
		// Hill: sloped track starting at z0.
		const z0 = Number(params.get("z0") ?? 1.0);
		const flat = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 8), toon("#f4f7ff"));
		flat.position.set(0, -0.2, z0 - 4);
		flat.receiveShadow = true;
		scene.add(flat);
		const hill = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 60), toon("#f4f7ff"));
		hill.rotation.x = -ang;
		hill.position.set(0, Math.sin(ang) * 30 - 0.2, z0 + Math.cos(ang) * 30);
		hill.receiveShadow = true;
		if (params.get("hill") === "1") scene.add(hill);
		const ground = (z: number) => Math.max(0, (z - z0) * slope);
		const kx = Number(params.get("kx") ?? 0.35);
		const fogC = params.get("fog") ?? "#ff8f6b";
		scene.fog = new THREE.Fog(fogC, Number(params.get("fn") ?? 5), Number(params.get("ff") ?? 26));
		const king = guy({ cape: params.get("cape") ?? undefined, color: params.get("kc") ?? "#2f7bff", hat: "crown", face: "shout", o: Number(params.get("ko") ?? 0.045), pose: {
			legL: 0.8, legR: -0.65, armL: [-0.55, 2.75], armR: [0.85, 0.3], lean: 0.12, headTilt: -0.1, yaw: -0.22,
			...(params.get("pose") === "punch" ? { armR: [-1.45, 0.05] as [number, number], armL: [-0.4, 2.7] as [number, number], yaw: 0.15, lean: 0.2 } : {}),
			// Overrides: kp=key:value;key:a|b
			...Object.fromEntries((params.get("kp") ?? "").split(";").filter(Boolean).map(kv => {
				const [k, v] = kv.split(":");
				return [k, v.includes("|") ? v.split("|").map(Number) : Number(v)];
			})),
		} });
		if (params.get("rig") === "2") {
			// Jointed king: charging, fist pumped, the other fist swinging forward.
			const p: RigPose = {
				thighL: -0.45, kneeL: -0.9, thighR: 0.9, kneeR: -0.35,
				shoulderL: [-0.3, 2.5], elbowL: 1.0, shoulderR: [0.9, 0.25], elbowR: 1.5,
				lean: 0.15, twist: -0.25, hipTwist: 0.15, headTilt: -0.12, headTurn: 0.1, headRoll: 0.06, yaw: -0.15, bob: 0.03,
			};
			// Overrides: p=key:value;key:value (arrays as a|b).
			for (const kv of (params.get("p") ?? "").split(";").filter(Boolean)) {
				const [k, v] = kv.split(":");
				(p as Record<string, unknown>)[k] = v.includes("|") ? v.split("|").map(Number) : Number(v);
			}
			king.clear();
			king.rotation.set(0, 0, 0);
			king.add(rig(params.get("kc") ?? "#2f7bff", p, Number(params.get("ko") ?? 0.045), params.get("kmat") === "std" ? "std" : "toon"));
		}
		// The king ignores the fog (always crisp in front).
		king.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material & { fog?: boolean }; if (m && m !== outlineMat) { const c = m.clone() as typeof m; c.fog = false; (o as THREE.Mesh).material = c; } });
		king.scale.setScalar(Number(params.get("ks") ?? 1.55));
		king.position.set(kx, 0, -0.5);
		scene.add(king);
		hero = king;
		const n = Number(params.get("n") ?? 420);
		for (let i = 0; i < n; i++) {
			const z = 0.4 + Math.pow(rand(), 0.85) * Number(params.get("depth") ?? 22);
			const x = (rand() * 2 - 1) * (5.2 + z * 0.15);
			// Ragged horizon: the back of the mob is uneven.
			const limit = Number(params.get("depth") ?? 22) * (0.78 + 0.22 * (0.5 + 0.5 * Math.sin(x * 0.9 + 1.3) * Math.cos(x * 0.37)));
			if (z > limit) continue;
			const dk = Math.hypot((x - kx) * 0.9, z + 0.5);
			if (dk < 1.25) continue;
			const cheer = rand() < 0.35;
			const g = guy({ color: rand() < 0.1 ? "#4f8fff" : (params.get("cc") ?? BLUE), face: "plain",
				pose: cheer ? { armL: [-0.2, 2.3 + rand() * 0.5], armR: [-0.2, 0.2 + rand() * 2.6], legL: rand() * 0.5, legR: -rand() * 0.5, lean: 0.05, yaw: (rand() - 0.5) * 0.5 }
					: runPose(rand(), { yaw: (rand() - 0.5) * 0.5 }) });
			g.position.set(x, ground(z), z);
			g.rotation.x = 0;
			scene.add(g);
		}
		camera.fov = Number(params.get("fov") ?? 46);
		const cp = (params.get("cam") ?? "0.6,1.0,-4.6").split(",").map(Number);
		const cl = (params.get("look") ?? "0,2.2,4").split(",").map(Number);
		camera.position.set(cp[0], cp[1], cp[2]);
		camera.lookAt(cl[0], cl[1], cl[2]);
	},

	/** B: bursting through a ×2 gate. */
	gate() {
		lights();
		track(9, 80);
		scene.fog = new THREE.Fog("#ffd27a", 14, 34);
		// Gate: two posts and a translucent blue banner with ×2.
		const gz = 2.6;
		for (const s of [-1, 1]) scene.add(box(0.28, 3.4, 0.28, "#e7ebf3", [s * 2.4, 1.7, gz], 0.04));
		const canvas = document.createElement("canvas");
		canvas.width = 512; canvas.height = 256;
		const c = canvas.getContext("2d")!;
		const grad = c.createLinearGradient(0, 0, 0, 256);
		grad.addColorStop(0, "#6fb0ff"); grad.addColorStop(1, "#2f7cf6");
		c.fillStyle = grad; c.fillRect(0, 0, 512, 256);
		c.font = "200px Lilita"; c.textAlign = "center"; c.textBaseline = "middle";
		c.lineWidth = 26; c.strokeStyle = INK; c.lineJoin = "round"; c.strokeText("×2", 256, 140);
		c.fillStyle = "#fff"; c.fillText("×2", 256, 140);
		const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
		const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.93, side: THREE.DoubleSide }));
		banner.position.set(0, 2.2, gz);
		banner.rotation.y = Math.PI;
		scene.add(banner);
		const king = guy({ color: BLUE, hat: "crown", face: "shout", o: 0.03, pose: {
			legL: 0.75, legR: -0.6, armR: [-0.4, 2.55], armL: [0.9, 0.25], lean: 0.12, headTilt: -0.12, yaw: 0.2,
		} });
		king.scale.setScalar(1.75);
		king.position.set(0, 0, -0.6);
		scene.add(king);
		for (let i = 0; i < 220; i++) {
			const z = 0.6 + Math.pow(rand(), 0.9) * 24;
			const x = (rand() * 2 - 1) * 4.2;
			if (Math.abs(x) < 0.9 && z < 1.6) continue;
			const g = guy({ color: BLUE, pose: runPose(rand(), { yaw: (rand() - 0.5) * 0.4 }) });
			g.scale.setScalar(1.05);
			g.position.set(x, 0, z);
			scene.add(g);
		}
		camera.fov = 44;
		camera.position.set(0.7, 1.25, -4.5);
		camera.lookAt(0, 1.9, 4);
	},

	/** D: a human pyramid rising to the sky, king on top. */
	pyramid() {
		lights("#fff1d6", "#ffe3b0", 1.6);
		const rows = [6, 5, 4, 3, 2, 1];
		const dx = 0.56, dy = 1.0;
		rows.forEach((n, r) => {
			for (let i = 0; i < n; i++) {
				const x = (i - (n - 1) / 2) * dx;
				const top = r === rows.length - 1;
				const g = guy({
					color: BLUE, hat: top ? "crown" : null, face: top ? "shout" : "happy",
					pose: top
						? { armL: [0, 2.6], armR: [0, 2.6], legL: 0.1, legR: -0.1, headTilt: -0.15 }
						: { armL: [-0.3, 2.2 + rand() * 0.4], armR: [-0.3, 2.2 + rand() * 0.4], legL: (rand() - 0.5) * 0.3, legR: (rand() - 0.5) * 0.3, yaw: (rand() - 0.5) * 0.3 },
				});
				g.position.set(x, r * dy, (rand() - 0.5) * 0.05);
				if (top) g.scale.setScalar(1.15);
				scene.add(g);
			}
		});
		camera.fov = 38;
		camera.position.set(0.5, 1.2, -9);
		camera.lookAt(0, 3.0, 0);
	},
};

document.fonts.load("200px Lilita").then(() => {
	(concepts[concept] ?? concepts.charge)();
	camera.aspect = 1;
	camera.updateProjectionMatrix();
	const sil = Number(params.get("sil") ?? 0);
	if (sil > 0 && hero) silhouetteRender(hero, sil);
	else renderer.render(scene, camera);
	(window as unknown as { __ready: boolean }).__ready = true;
});

/**
 * Renders the background, then the hero alone, and composites them with one
 * clean ink outline around the hero's whole silhouette (no outline per block,
 * so no dark slits where the blocks meet).
 */
function silhouetteRender(target: THREE.Object3D, px: number) {
	const gl = renderer.domElement;
	const W = gl.width, H = gl.height;
	const grab = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d")!.drawImage(gl, 0, 0); return c; };

	target.visible = false;
	renderer.render(scene, camera);
	const back = grab();

	target.visible = true;
	const hidden: THREE.Object3D[] = [];
	for (const child of scene.children)
		if (child !== target && !(child instanceof THREE.Light) && child.visible) { child.visible = false; hidden.push(child); }
	const fog = scene.fog;
	scene.fog = null;
	renderer.render(scene, camera);
	const front = grab();
	scene.fog = fog;
	for (const h of hidden) h.visible = true;

	// Ink-tinted copy of the hero, stamped around itself = dilated silhouette.
	const ink = document.createElement("canvas"); ink.width = W; ink.height = H;
	const ic = ink.getContext("2d")!;
	ic.drawImage(front, 0, 0);
	ic.globalCompositeOperation = "source-in";
	ic.fillStyle = INK; ic.fillRect(0, 0, W, H);

	const out = document.createElement("canvas"); out.width = W; out.height = H;
	out.style.width = gl.style.width; out.style.height = gl.style.height;
	const oc = out.getContext("2d")!;
	oc.drawImage(back, 0, 0);
	const r = px * renderer.getPixelRatio();
	for (let a = 0; a < 48; a++) for (const k of [0.5, 1]) {
		const t = (a / 48) * Math.PI * 2;
		oc.drawImage(ink, Math.cos(t) * r * k, Math.sin(t) * r * k);
	}
	oc.drawImage(front, 0, 0);
	gl.replaceWith(out);
	(window as unknown as { __dbg: unknown }).__dbg = { back, front, ink };
}
