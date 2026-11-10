import * as THREE from "three";
import { Entity } from "../../Entity";
import type { Game } from "../../Game";

const STREAKS = 26;
const FAN_RADIUS = 1.3;

/**
 * Giant fan next to the track: blows the crowd sideways while it is in
 * front of it (toward a hole or a hazard). Steering against the wind is needed.
 */
export class Fan extends Entity {
	private readonly object = new THREE.Group();
	private readonly blades = new THREE.Group();
	private readonly streaks: THREE.Mesh[] = [];
	private readonly seeds: { z: number; y: number; phase: number }[] = [];
	private readonly disposables: { dispose(): void }[] = [];
	/** World z range of the wind. */
	private readonly zMin: number;
	private readonly zMax: number;
	private readonly dir: number;

	constructor(
		z: number,
		private readonly depth: number,
		/** Drift speed of the crowd (units/s) while it is not steered against the wind, > 0 toward +x. */
		readonly strength: number,
		private readonly trackWidth: number,
	) {
		super();
		this.dir = Math.sign(strength) || 1;
		this.zMax = -z;
		this.zMin = -z - depth;
		// The fan stands on the upwind side, facing the track.
		this.position.set(-this.dir * (trackWidth / 2 + 1.4), 0, -z - depth / 2);

		const postGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.6, 8).translate(0, 0.8, 0);
		const frameGeo = new THREE.TorusGeometry(FAN_RADIUS, 0.12, 8, 28).rotateY(Math.PI / 2);
		const hubGeo = new THREE.SphereGeometry(0.28, 12, 8);
		const bladeGeo = new THREE.BoxGeometry(0.06, FAN_RADIUS * 0.9, 0.42).translate(0, FAN_RADIUS * 0.45, 0);
		const metal = new THREE.MeshStandardMaterial({ color: "#64748b", metalness: 0.6, roughness: 0.4 });
		const bladeMat = new THREE.MeshStandardMaterial({ color: "#38bdf8", roughness: 0.5 });
		this.disposables.push(postGeo, frameGeo, hubGeo, bladeGeo, metal, bladeMat);

		this.object.add(new THREE.Mesh(postGeo, metal));
		const head = new THREE.Group();
		head.position.y = 1.6 + FAN_RADIUS * 0.5;
		head.add(new THREE.Mesh(frameGeo, metal), new THREE.Mesh(hubGeo, metal));
		for (let i = 0; i < 4; i++) {
			const blade = new THREE.Mesh(bladeGeo, bladeMat);
			blade.rotation.x = (i / 4) * Math.PI * 2;
			blade.rotation.y = 0.35;
			this.blades.add(blade);
		}
		head.add(this.blades);
		this.object.add(head);

		// Wind streaks over the track (world space, children of the object).
		const streakGeo = new THREE.PlaneGeometry(1.4, 0.05).rotateX(-Math.PI / 4);
		const streakMat = new THREE.MeshBasicMaterial({
			color: "#ffffff", transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide,
		});
		this.disposables.push(streakGeo, streakMat);
		for (let i = 0; i < STREAKS; i++) {
			const s = new THREE.Mesh(streakGeo, streakMat);
			this.streaks.push(s);
			this.seeds.push({ z: Math.random() * depth, y: 0.3 + Math.random() * 1.4, phase: Math.random() });
			this.object.add(s);
		}
	}

	getObject() {
		return this.object;
	}

	/** Sideways push at world z (0 outside the wind). */
	pushAt(z: number): number {
		return z <= this.zMax && z >= this.zMin ? this.strength : 0;
	}

	frame(game: Game, dt: number) {
		this.blades.rotation.x += dt * 18 * this.dir;
		// Streaks fly across the track, from the fan to the other side.
		const span = this.trackWidth + 2;
		const speed = Math.abs(this.strength) * 1.6 + 6;
		for (let i = 0; i < STREAKS; i++) {
			const seed = this.seeds[i];
			const t = (game.time * speed / span + seed.phase) % 1;
			const x = this.dir * (-span / 2 + t * span);
			this.streaks[i].position.set(x - this.position.x, seed.y, -this.depth / 2 + seed.z);
		}
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}
}
