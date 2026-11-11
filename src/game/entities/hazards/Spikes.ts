import * as THREE from "three";
import { Hazard } from "../Hazard";
import type { Game } from "../../Game";
import type { Player } from "../Player";

const SPIKE_HEIGHT = 0.45;
const SPACING = 0.5;
/** Spikes only hurt when raised above this fraction of their height. */
const ACTIVE_FROM = 0.5;

const coneGeometry = new THREE.ConeGeometry(0.14, SPIKE_HEIGHT, 4).translate(0, SPIKE_HEIGHT / 2, 0);
const spikeMaterial = new THREE.MeshStandardMaterial({ color: "#b8c2d1", metalness: 0.6, roughness: 0.35 });
const matrix = new THREE.Matrix4();

/**
 * Warning colors of the plate while the spikes are down: the down half of the
 * cycle is split in equal steps (gray, dark red, red, bright red), then the
 * spikes go up. Gives 5 readable beats.
 */
const PLATE_IDLE = new THREE.Color("#4b5563");
const WARN_STEPS = [PLATE_IDLE, new THREE.Color("#5c1f1f"), new THREE.Color("#a12828"), new THREE.Color("#ff2a2a")];
const WARN_GLOW = [0, 0.05, 0.25, 0.7];

/** A field of spikes on the floor. Can go up and down periodically. */
export class Spikes extends Hazard {
	private readonly object = new THREE.Group();
	private readonly spikes: THREE.InstancedMesh;
	private readonly plate: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
	/** Current raise amount in [0, 1]. */
	private raise = 1;
	/** Warning step while down (index in WARN_STEPS), -1 when up. */
	private warnStep = -1;

	constructor(
		x: number,
		z: number,
		private readonly width: number,
		private readonly depth: number,
		private readonly period = 0,
		private readonly offset = 0,
	) {
		super();
		// z = start (distance), the field spans [z, z + depth] → world [-z - depth, -z].
		this.position.set(x, 0, -z - depth / 2);
		this.hitboxHalf.set(width / 2 - 0.05, SPIKE_HEIGHT * 0.4, depth / 2 - 0.05);
		this.hitboxOffset.set(0, SPIKE_HEIGHT * 0.4, 0);

		this.plate = new THREE.Mesh(
			new THREE.BoxGeometry(width, 0.04, depth),
			new THREE.MeshStandardMaterial({ color: "#4b5563", roughness: 0.8 }),
		);
		this.plate.position.y = 0.02;
		this.object.add(this.plate);

		const nx = Math.max(1, Math.round(width / SPACING));
		const nz = Math.max(1, Math.round(depth / SPACING));
		this.spikes = new THREE.InstancedMesh(coneGeometry, spikeMaterial, nx * nz);
		let i = 0;
		for (let ix = 0; ix < nx; ix++)
			for (let iz = 0; iz < nz; iz++) {
				matrix.makeTranslation(
					-width / 2 + (ix + 0.5) * (width / nx),
					0,
					-depth / 2 + (iz + 0.5) * (depth / nz),
				);
				this.spikes.setMatrixAt(i++, matrix);
			}
		this.object.add(this.spikes);
	}

	/** Spikes going up and down (the players on them cannot move sideways). */
	isBlinking(): boolean {
		return this.period > 0;
	}

	/** Whether the point (x, z) is on the field. */
	covers(x: number, z: number): boolean {
		return Math.abs(x - this.position.x) <= this.width / 2
			&& Math.abs(z - this.position.z) <= this.depth / 2;
	}

	getObject() {
		return this.object;
	}

	/** Position in the cycle, in [0, 1) (up during the first half). */
	private phase(time: number): number {
		return ((time / this.period + this.offset) % 1 + 1) % 1;
	}

	private target(time: number): number {
		if (this.period <= 0) return 1;
		return this.phase(time) < 0.5 ? 1 : 0;
	}

	frame(game: Game, dt: number) {
		const target = this.target(game.time);
		// Fast up, slower down; a short warning before going up.
		const warn = this.period > 0 && target === 0 && this.target(game.time + 0.35) === 1;
		const goal = warn ? 0.18 : target;
		const rate = goal > this.raise ? 14 : 6;
		this.raise += Math.sign(goal - this.raise) * Math.min(Math.abs(goal - this.raise), rate * dt);

		if (this.period > 0) {
			const t = this.phase(game.time);
			this.warnStep = t < 0.5 ? -1 : Math.min(WARN_STEPS.length - 1, Math.floor((t - 0.5) * 2 * WARN_STEPS.length));
		}
	}

	onPlayerHit(player: Player, game: Game) {
		if (this.raise < ACTIVE_FROM || player.position.y > SPIKE_HEIGHT * 0.6) return;
		super.onPlayerHit(player, game);
	}

	protected knockback() {
		return new THREE.Vector3(0, 7, 2);
	}

	update() {
		super.update();
		this.spikes.position.y = (this.raise - 1) * SPIKE_HEIGHT;
		const m = this.plate.material;
		if (this.period > 0) {
			const step = this.warnStep < 0 ? WARN_STEPS.length - 1 : this.warnStep;
			m.color.copy(WARN_STEPS[step]);
			m.emissive.copy(WARN_STEPS[step]);
			m.emissiveIntensity = WARN_GLOW[step];
		} else {
			m.color.copy(PLATE_IDLE);
		}
	}

	dispose() {
		this.plate.geometry.dispose();
		this.plate.material.dispose();
		this.spikes.dispose();
	}
}
