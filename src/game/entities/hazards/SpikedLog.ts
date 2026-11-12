import * as THREE from "three";
import { Hazard } from "../Hazard";
import type { Game } from "../../Game";
import type { Player } from "../Player";

/** Radius of the central log (standing). */
const HUB_RADIUS = 0.45;
const HUB_HEIGHT = 1.1;
/** Radius of the spiked logs sticking out of it (lying, at ARM_Y). */
const ARM_RADIUS = 0.2;
const ARM_Y = 0.45;
const SPIKE_LENGTH = 0.22;
/** Players closer than this to the axis of an arm are hit (arm + spikes + body). */
const ARM_REACH = ARM_RADIUS + SPIKE_LENGTH * 0.6 + 0.18;
const HUB_REACH = HUB_RADIUS + 0.2;
/** Players above this height pass over the arms (jumps). */
const CLEAR_HEIGHT = ARM_Y + ARM_RADIUS + SPIKE_LENGTH;

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Central log turning on itself, with spiked logs sticking out of it at the
 * given angles: they sweep the track. A player touched by a spiked log dies
 * (or loses its shield).
 */
export class SpikedLog extends Hazard {
	private readonly object = new THREE.Group();
	private readonly rotor = new THREE.Group();
	private readonly disposables: { dispose(): void }[] = [];
	private readonly cx: number;
	private readonly cz: number;
	/** Angles of the arms (radians, 0 = toward +x, counterclockwise seen from above). */
	private readonly arms: number[];
	/** Current rotation (radians). */
	private angle = 0;

	constructor(
		x: number,
		z: number,
		/** Length of the arms, from the axis to their tip. */
		private readonly length: number,
		angles: number[],
		/** Degrees per second, > 0 counterclockwise seen from above. */
		private readonly speed: number,
	) {
		super();
		this.cx = x;
		this.cz = -z;
		this.position.set(x, 0, -z);
		this.arms = angles.map(a => a * DEG);
		this.hitboxHalf.set(length + 0.3, 0.6, length + 0.3);
		this.hitboxOffset.set(0, 0.6, 0);

		const bark = new THREE.MeshStandardMaterial({ color: "#8b5a2b", roughness: 0.9 });
		const wood = new THREE.MeshStandardMaterial({ color: "#d9a066", roughness: 0.8 });
		const steel = new THREE.MeshStandardMaterial({ color: "#c7ced8", metalness: 0.7, roughness: 0.3 });
		const band = new THREE.MeshStandardMaterial({ color: "#4b5563", metalness: 0.6, roughness: 0.4 });
		this.disposables.push(bark, wood, steel, band);

		// Central log, standing, with metal bands and a cut top.
		const hubGeo = new THREE.CylinderGeometry(HUB_RADIUS, HUB_RADIUS * 1.05, HUB_HEIGHT, 16).translate(0, HUB_HEIGHT / 2, 0);
		const topGeo = new THREE.CircleGeometry(HUB_RADIUS * 0.96, 16).rotateX(-Math.PI / 2).translate(0, HUB_HEIGHT + 0.002, 0);
		const bandGeo = new THREE.CylinderGeometry(HUB_RADIUS * 1.06, HUB_RADIUS * 1.06, 0.08, 16);
		this.disposables.push(hubGeo, topGeo, bandGeo);
		this.rotor.add(new THREE.Mesh(hubGeo, bark), new THREE.Mesh(topGeo, wood));
		for (const y of [0.2, HUB_HEIGHT - 0.2]) {
			const b = new THREE.Mesh(bandGeo, band);
			b.position.y = y;
			this.rotor.add(b);
		}

		// Spiked logs, lying, from the hub to `length`.
		const armLen = Math.max(0.3, length - HUB_RADIUS * 0.6);
		const armGeo = new THREE.CylinderGeometry(ARM_RADIUS, ARM_RADIUS, armLen, 10).rotateZ(Math.PI / 2).translate(HUB_RADIUS * 0.6 + armLen / 2, 0, 0);
		const endGeo = new THREE.CircleGeometry(ARM_RADIUS * 0.95, 10).rotateY(Math.PI / 2).translate(length + 0.002, 0, 0);
		const spikeGeo = new THREE.ConeGeometry(0.07, SPIKE_LENGTH, 5).translate(0, SPIKE_LENGTH / 2, 0);
		this.disposables.push(armGeo, endGeo, spikeGeo);
		const rings = Math.max(1, Math.round(armLen / 0.45));
		const around = 5;
		for (const a of this.arms) {
			const arm = new THREE.Group();
			arm.add(new THREE.Mesh(armGeo, bark), new THREE.Mesh(endGeo, wood));
			const spikes = new THREE.InstancedMesh(spikeGeo, steel, rings * around);
			const m = new THREE.Matrix4(), q = new THREE.Quaternion(), dir = new THREE.Vector3(), p = new THREE.Vector3();
			let i = 0;
			for (let r = 0; r < rings; r++) {
				const ax = HUB_RADIUS * 0.6 + (r + 0.5) * armLen / rings;
				for (let k = 0; k < around; k++) {
					const t = (k / around + (r % 2) * 0.5 / around) * Math.PI * 2;
					dir.set(0, Math.cos(t), Math.sin(t));
					q.setFromUnitVectors(UP, dir);
					p.set(ax, 0, 0).addScaledVector(dir, ARM_RADIUS * 0.9);
					m.compose(p, q, new THREE.Vector3(1, 1, 1));
					spikes.setMatrixAt(i++, m);
				}
			}
			this.disposables.push(spikes);
			arm.add(spikes);
			arm.position.y = ARM_Y;
			arm.rotation.y = a;
			this.rotor.add(arm);
		}
		this.object.add(this.rotor);

		// Shadow disc showing the swept area.
		const areaGeo = new THREE.RingGeometry(length - 0.08, length + 0.08, 48).rotateX(-Math.PI / 2);
		const areaMat = new THREE.MeshBasicMaterial({ color: "#7c2d12", transparent: true, opacity: 0.35, depthWrite: false });
		this.disposables.push(areaGeo, areaMat);
		const area = new THREE.Mesh(areaGeo, areaMat);
		area.position.y = 0.012;
		this.object.add(area);
	}

	getObject() {
		return this.object;
	}

	frame(game: Game) {
		this.angle = game.time * this.speed * DEG;
		this.position.set(this.cx, 0, this.cz);
	}

	/** Only the players actually touching the hub or a spiked log are hit. */
	onPlayerHit(player: Player, game: Game) {
		if (player.position.y > CLEAR_HEIGHT) return;
		const dx = player.position.x - this.cx, dz = player.position.z - this.cz;
		if (Math.hypot(dx, dz) < HUB_REACH) {
			super.onPlayerHit(player, game);
			return;
		}
		for (const a of this.arms) {
			// Rotation around +y: local +x goes to (cos θ, -sin θ) in (x, z).
			const t = a + this.angle;
			const ux = Math.cos(t), uz = -Math.sin(t);
			const along = Math.max(0, Math.min(this.length, dx * ux + dz * uz));
			const ox = dx - ux * along, oz = dz - uz * along;
			if (ox * ox + oz * oz < ARM_REACH * ARM_REACH) {
				super.onPlayerHit(player, game);
				return;
			}
		}
	}

	protected knockback(player: Player) {
		// Thrown along the sweep (tangent), a bit outward.
		const dx = player.position.x - this.cx, dz = player.position.z - this.cz;
		const d = Math.hypot(dx, dz) || 1;
		const s = Math.sign(this.speed) || 1;
		return new THREE.Vector3((dz / d * s + dx / d * 0.4) * 6, 7, (-dx / d * s + dz / d * 0.4) * 6);
	}

	update() {
		super.update();
		this.rotor.rotation.y = this.angle;
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}
}
