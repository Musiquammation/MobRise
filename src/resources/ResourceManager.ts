import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * A resource to load.
 * `priority`: the smaller, the more important. Important resources stay in
 * memory longer once released (see ResourceManager.collect).
 */
export type ResourceRequest = {
	id: string;
	path: string;
	priority: number;
};

export type ResourceKind = "model" | "texture" | "json";

type Entry = {
	id: string;
	path: string;
	kind: ResourceKind;
	priority: number;
	data: unknown;
	/** Estimated memory usage, in bytes. */
	bytes: number;
	/** Number of active users (load() increments, release() decrements). */
	refs: number;
	/** Time (ms) at which the last user released it. null while in use. */
	releasedAt: number | null;
};

export type LoadProgress = (loaded: number, total: number, id: string) => void;

export type ResourceManager = {
	/** Loads (or re-acquires) every resource. Resolves once all are ready. */
	load(requests: ResourceRequest[], onProgress?: LoadProgress): Promise<void>;
	/** Returns a loaded resource. Throws if it is not loaded. */
	get<T>(id: string): T;
	getModel(id: string): GLTF;
	getTexture(id: string): THREE.Texture;
	getJson<T>(id: string): T;
	has(id: string): boolean;
	/** Marks resources as no longer needed. They stay cached until collected. */
	release(ids: string[]): void;
	/** Frees released resources until memory usage fits the budget. */
	collect(): void;
	usage(): { bytes: number; budget: number; count: number };
};

function kindOf(path: string): ResourceKind {
	const ext = path.split("?")[0].split(".").pop()!.toLowerCase();
	if (ext === "gltf" || ext === "glb") return "model";
	if (ext === "json") return "json";
	return "texture";
}

function estimateObjectBytes(root: THREE.Object3D): number {
	let bytes = 0;
	const seen = new Set<unknown>();
	root.traverse(o => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh || seen.has(mesh.geometry)) return;
		seen.add(mesh.geometry);
		for (const attr of Object.values(mesh.geometry.attributes))
			bytes += (attr as THREE.BufferAttribute).array.byteLength;
		if (mesh.geometry.index) bytes += mesh.geometry.index.array.byteLength;
	});
	return bytes;
}

function textureBytes(tex: THREE.Texture): number {
	const img = tex.image as { width?: number; height?: number } | undefined;
	return (img?.width ?? 1) * (img?.height ?? 1) * 4;
}

function disposeObject(root: THREE.Object3D) {
	root.traverse(o => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		mesh.geometry.dispose();
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const m of mats) {
			for (const v of Object.values(m))
				if (v instanceof THREE.Texture) v.dispose();
			m.dispose();
		}
	});
}

/**
 * Creates a resource manager.
 *
 * Unloading policy: when the memory budget is exceeded, released resources are
 * evicted by decreasing score, where
 *     score = bytes * timeSinceRelease * (priority + 1)
 * so big, long-unused, unimportant resources go first.
 */
export function createResourceManager(budgetBytes = 64 * 1024 * 1024): ResourceManager {
	const entries = new Map<string, Entry>();
	const pending = new Map<string, Promise<Entry>>();
	const gltfLoader = new GLTFLoader();
	const textureLoader = new THREE.TextureLoader();

	async function fetchOne(req: ResourceRequest): Promise<Entry> {
		const kind = kindOf(req.path);
		let data: unknown;
		let bytes: number;

		if (kind === "model") {
			const gltf = await gltfLoader.loadAsync(req.path);
			data = gltf;
			bytes = estimateObjectBytes(gltf.scene);
		} else if (kind === "texture") {
			const tex = await textureLoader.loadAsync(req.path);
			tex.colorSpace = THREE.SRGBColorSpace;
			data = tex;
			bytes = textureBytes(tex);
		} else {
			const res = await fetch(req.path);
			if (!res.ok) throw new Error(`Cannot load ${req.path}: ${res.status}`);
			const text = await res.text();
			data = JSON.parse(text);
			bytes = text.length * 2;
		}

		return { id: req.id, path: req.path, kind, priority: req.priority, data, bytes, refs: 0, releasedAt: null };
	}

	function free(entry: Entry) {
		if (entry.kind === "model") disposeObject((entry.data as GLTF).scene);
		else if (entry.kind === "texture") (entry.data as THREE.Texture).dispose();
		entries.delete(entry.id);
	}

	const manager: ResourceManager = {
		async load(requests, onProgress) {
			// Most important first: they get the network before the others.
			const sorted = [...requests].sort((a, b) => a.priority - b.priority);
			const total = sorted.length;
			let loaded = 0;
			onProgress?.(0, total, "");

			await Promise.all(sorted.map(async req => {
				let entry = entries.get(req.id);

				if (!entry) {
					let promise = pending.get(req.id);
					if (!promise) {
						promise = fetchOne(req);
						pending.set(req.id, promise);
					}
					try {
						entry = await promise;
					} finally {
						pending.delete(req.id);
					}
					// Another concurrent load() may have registered it meanwhile.
					entry = entries.get(req.id) ?? entry;
					entries.set(req.id, entry);
				}

				entry.refs++;
				entry.releasedAt = null;
				// The most important request wins.
				entry.priority = Math.min(entry.priority, req.priority);

				loaded++;
				onProgress?.(loaded, total, req.id);
			}));

			manager.collect();
		},

		get<T>(id: string): T {
			const entry = entries.get(id);
			if (!entry) throw new Error(`Resource "${id}" is not loaded`);
			return entry.data as T;
		},

		getModel: id => manager.get<GLTF>(id),
		getTexture: id => manager.get<THREE.Texture>(id),
		getJson: <T>(id: string) => manager.get<T>(id),
		has: id => entries.has(id),

		release(ids) {
			const now = performance.now();
			for (const id of ids) {
				const entry = entries.get(id);
				if (!entry || entry.refs === 0) continue;
				entry.refs--;
				if (entry.refs === 0) entry.releasedAt = now;
			}
			manager.collect();
		},

		collect() {
			let used = 0;
			for (const e of entries.values()) used += e.bytes;
			if (used <= budgetBytes) return;

			const now = performance.now();
			const candidates = [...entries.values()]
				.filter(e => e.refs === 0 && e.releasedAt !== null)
				.map(e => ({ e, score: e.bytes * (now - e.releasedAt! + 1) * (e.priority + 1) }))
				.sort((a, b) => b.score - a.score);

			for (const { e } of candidates) {
				if (used <= budgetBytes) break;
				used -= e.bytes;
				free(e);
			}
		},

		usage() {
			let bytes = 0;
			for (const e of entries.values()) bytes += e.bytes;
			return { bytes, budget: budgetBytes, count: entries.size };
		},
	};

	return manager;
}
