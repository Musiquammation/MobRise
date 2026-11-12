import * as THREE from "three";
import { Entity } from "../Entity";
import type { Game } from "../Game";
import type { Spikes } from "./hazards/Spikes";
import { audio } from "../../audio/audio";

const CAP_HEIGHT = 0.22;
/** Cap height once pressed. */
const PRESSED_HEIGHT = 0.04;

/**
 * Colors linking a button to its spike fields (the button cap and the border
 * of the fields). Never red: red means danger.
 */
export const BUTTON_COLORS = ["#facc15", "#22d3ee", "#e879f9", "#a3e635", "#fb923c", "#818cf8"];

/**
 * Big round button on the floor. The first player of the crowd stepping on it
 * presses it: its spike fields go down for good.
 */
export class Button extends Entity {
	pressed = false;
	private readonly object = new THREE.Group();
	private readonly cap: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
	private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
	private readonly disposables: { dispose(): void }[] = [];
	/** Current cap height (animated). */
	private height = CAP_HEIGHT;
	/** Time since it was pressed (flash). */
	private since = Infinity;

	constructor(
		x: number,
		z: number,
		radius: number,
		readonly color: string,
		private readonly targets: readonly Spikes[],
	) {
		super();
		// z = center of the button (distance).
		this.position.set(x, 0, -z);
		this.hitboxHalf.set(radius * 0.8, 0.3, radius * 0.8);
		this.hitboxOffset.set(0, 0.3, 0);

		const baseGeo = new THREE.CylinderGeometry(radius, radius * 1.08, 0.08, 32);
		const baseMat = new THREE.MeshStandardMaterial({ color: "#374151", roughness: 0.7, metalness: 0.3 });
		const capGeo = new THREE.CylinderGeometry(radius * 0.78, radius * 0.82, 1, 32).translate(0, 0.5, 0);
		const capMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 });
		// Pulsing ring around the button while it waits: "step here".
		const ringGeo = new THREE.RingGeometry(radius * 1.15, radius * 1.4, 40).rotateX(-Math.PI / 2);
		const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false });
		this.disposables.push(baseGeo, baseMat, capGeo, capMat, ringGeo, ringMat);

		const base = new THREE.Mesh(baseGeo, baseMat);
		base.position.y = 0.04;
		this.cap = new THREE.Mesh(capGeo, capMat);
		this.cap.position.y = 0.08;
		this.ring = new THREE.Mesh(ringGeo, ringMat);
		this.ring.position.y = 0.015;
		this.object.add(base, this.cap, this.ring);
	}

	getObject() {
		return this.object;
	}

	/** A player of the crowd stepped on it. */
	press(_game: Game) {
		if (this.pressed) return;
		this.pressed = true;
		this.since = 0;
		for (const s of this.targets) s.retract();
		audio.play("click", { rate: 0.8 });
		audio.play("gateUp", { rate: 0.9, volume: 0.6 });
	}

	frame(game: Game, dt: number) {
		this.since += dt;
		const goal = this.pressed ? PRESSED_HEIGHT : CAP_HEIGHT;
		this.height += (goal - this.height) * Math.min(1, dt * 18);
		const m = this.ring.material;
		m.opacity = this.pressed ? Math.max(0, 0.6 - this.since * 1.5) : 0.35 + Math.sin(game.time * 6) * 0.25;
	}

	update() {
		super.update();
		this.cap.scale.y = this.height;
		const m = this.cap.material;
		// Bright flash when pressed, then darker (done).
		m.emissiveIntensity = this.pressed ? Math.max(0, 1 - this.since * 2) * 0.9 : 0.25;
		if (this.pressed && this.since > 0.5) m.color.set(this.color).multiplyScalar(0.55);
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}
}
