import * as THREE from "three";
import { Hazard } from "../Hazard";
import type { Game } from "../../Game";
import type { Player } from "../Player";

const THICKNESS = 0.12;

/** Circular saw blade going back and forth along a groove in the floor. */
export class Saw extends Hazard {
	private readonly object = new THREE.Group();
	private readonly blade = new THREE.Group();
	private readonly groove: THREE.Mesh;
	private readonly disposables: { dispose(): void }[] = [];
	private readonly cx: number;
	private readonly cz: number;
	private spin = 0;
	private dir = 1;

	constructor(
		x: number,
		z: number,
		private readonly axis: "x" | "z",
		private readonly length: number,
		private readonly speed: number,
		radius = 0.9,
		private readonly offset = 0,
	) {
		super();
		this.cx = x;
		this.cz = -z;
		this.position.set(x, 0, -z);

		// Blade: a disc in the plane (travel axis, y), half above the floor.
		const disc = new THREE.CylinderGeometry(radius, radius, THICKNESS, 24);
		const discMat = new THREE.MeshStandardMaterial({ color: "#d1d5db", metalness: 0.8, roughness: 0.25 });
		const teeth = new THREE.ConeGeometry(0.13, 0.26, 3);
		const teethMat = new THREE.MeshStandardMaterial({ color: "#9ca3af", metalness: 0.8, roughness: 0.3 });
		const hub = new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, THICKNESS * 1.6, 12);
		const hubMat = new THREE.MeshStandardMaterial({ color: "#dc2626", roughness: 0.5 });
		this.disposables.push(disc, discMat, teeth, teethMat, hub, hubMat);

		const wheel = new THREE.Group();
		wheel.add(new THREE.Mesh(disc, discMat), new THREE.Mesh(hub, hubMat));
		const n = 14;
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2;
			const t = new THREE.Mesh(teeth, teethMat);
			const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
			t.position.copy(out).multiplyScalar(radius);
			t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
			wheel.add(t);
		}
		// Cylinder axis (Y) → normal of the blade plane.
		wheel.rotation.x = Math.PI / 2; // normal along Z
		this.blade.add(wheel);
		if (axis === "z") this.blade.rotation.y = Math.PI / 2; // normal along X
		this.blade.position.y = radius * 0.35;
		this.object.add(this.blade);

		// Groove in the floor (world space, not moving with the blade).
		const len = length + radius * 2;
		const grooveGeo = new THREE.BoxGeometry(axis === "x" ? len : 0.22, 0.02, axis === "x" ? 0.22 : len);
		const grooveMat = new THREE.MeshStandardMaterial({ color: "#374151", roughness: 0.9 });
		this.disposables.push(grooveGeo, grooveMat);
		this.groove = new THREE.Mesh(grooveGeo, grooveMat);
		this.object.add(this.groove);

		const h = radius * 0.35 + radius;
		if (axis === "x") this.hitboxHalf.set(radius * 0.85, h / 2, THICKNESS * 2);
		else this.hitboxHalf.set(THICKNESS * 2, h / 2, radius * 0.85);
		this.hitboxOffset.set(0, h / 2, 0);
	}

	getObject() {
		return this.object;
	}

	frame(game: Game, dt: number) {
		const freq = this.length > 0 ? this.speed / (2 * this.length) : 0;
		const phase = (game.time * freq + this.offset) * Math.PI * 2;
		const s = -Math.cos(phase) * this.length / 2;
		this.dir = Math.sin(phase) >= 0 ? 1 : -1;
		if (this.axis === "x") this.position.set(this.cx + s, 0, this.cz);
		else this.position.set(this.cx, 0, this.cz - s);
		this.spin += dt * 14;
	}

	protected knockback(_player: Player) {
		return this.axis === "x"
			? new THREE.Vector3(this.dir * 6, 7, 0)
			: new THREE.Vector3(0, 7, -this.dir * 6);
	}

	update() {
		this.object.position.copy(this.position);
		// The groove stays in place while the blade moves.
		this.groove.position.set(this.cx - this.position.x, 0.012, this.cz - this.position.z);
		this.blade.children[0].rotation.y = this.spin;
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}
}
