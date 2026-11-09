import * as THREE from "three";
import { Entity } from "../../Entity";
import type { Game } from "../../Game";

/** Radius of the area hit when the arrow lands. */
export const ARROW_HIT_RADIUS = 0.95;
const STUCK_TIME = 0.6;

const ringGeometry = new THREE.RingGeometry(ARROW_HIT_RADIUS - 0.12, ARROW_HIT_RADIUS, 32).rotateX(-Math.PI / 2);
const discGeometry = new THREE.CircleGeometry(ARROW_HIT_RADIUS, 32).rotateX(-Math.PI / 2);
const X = new THREE.Vector3(1, 0, 0);
const dir = new THREE.Vector3();

/**
 * Arrow shot by an archer: flies in an arc to a point of the ground marked by
 * a red circle, and kills the players inside the circle when it lands.
 */
export class ArcherArrow extends Entity {
	private readonly object = new THREE.Group();
	private readonly arrow: THREE.Object3D;
	private readonly marker = new THREE.Group();
	private readonly ringMat = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, depthWrite: false });
	private readonly fillMat = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.25, depthWrite: false });
	private readonly fill: THREE.Mesh;
	private readonly from = new THREE.Vector3();
	private readonly target = new THREE.Vector3();
	private t = 0;
	private landed = false;

	constructor(model: THREE.Object3D, from: THREE.Vector3, target: THREE.Vector3, private readonly flight: number) {
		super();
		this.from.copy(from);
		this.target.copy(target);
		this.position.copy(from);
		this.arrow = model.clone();
		this.arrow.scale.setScalar(0.8);
		this.fill = new THREE.Mesh(discGeometry, this.fillMat);
		this.marker.add(new THREE.Mesh(ringGeometry, this.ringMat), this.fill);
		this.marker.position.set(target.x, 0.03, target.z);
		this.object.add(this.arrow, this.marker);
	}

	getObject() {
		return this.object;
	}

	frame(game: Game, dt: number) {
		this.t += dt;
		if (!this.landed && this.t >= this.flight) {
			this.landed = true;
			game.hitArea(this.target.x, this.target.z, ARROW_HIT_RADIUS);
		}
		if (this.t >= this.flight + STUCK_TIME) this.kill();
	}

	update() {
		const k = Math.min(1, this.t / this.flight);
		const apex = 2.5;
		const x = this.from.x + (this.target.x - this.from.x) * k;
		const z = this.from.z + (this.target.z - this.from.z) * k;
		const y = this.from.y * (1 - k) + 4 * apex * k * (1 - k);
		this.position.set(x, Math.max(0.15, y), z);
		this.arrow.position.copy(this.position);

		if (!this.landed) {
			// Tangent of the arc.
			const dk = 1 / this.flight;
			dir.set(
				(this.target.x - this.from.x) * dk,
				(-this.from.y + 4 * apex * (1 - 2 * k)) * dk,
				(this.target.z - this.from.z) * dk,
			).normalize();
			this.arrow.quaternion.setFromUnitVectors(X, dir);
			this.fill.scale.setScalar(Math.max(0.01, k));
			this.ringMat.opacity = 0.6 + Math.sin(this.t * 20) * 0.3;
		} else {
			const fade = 1 - (this.t - this.flight) / STUCK_TIME;
			this.ringMat.opacity = fade * 0.8;
			this.fillMat.opacity = fade * 0.5;
		}
	}

	dispose() {
		this.ringMat.dispose();
		this.fillMat.dispose();
	}
}
