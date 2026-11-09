import * as THREE from "three";
import { Entity } from "../../Entity";
import type { Game } from "../../Game";
import { ArcherArrow } from "./ArcherArrow";

const TOWER_HEIGHT = 1.8;
/** Flight time of an arrow (time to dodge it). */
const FLIGHT = 1.2;
/** Starts shooting when the crowd is this close (distance before the archer). */
const RANGE_BEFORE = 34;
/** Keeps shooting until the crowd is this far past the archer. */
const RANGE_AFTER = 4;

/** Stands on a tower next to the track and shoots arrows at the crowd. */
export class Archer extends Entity {
	private readonly object = new THREE.Group();
	private readonly figure = new THREE.Group();
	private readonly bow: THREE.Mesh;
	private readonly disposables: { dispose(): void }[] = [];
	private cooldown: number;
	private draw = 0;
	private readonly bowPos = new THREE.Vector3();
	private readonly target = new THREE.Vector3();

	constructor(
		playerModel: THREE.Object3D,
		private readonly arrowModel: THREE.Object3D,
		x: number,
		z: number,
		private readonly interval: number,
		offset: number,
	) {
		super();
		this.position.set(x, 0, z);
		this.cooldown = offset * interval;

		const towerGeo = new THREE.CylinderGeometry(0.75, 0.9, TOWER_HEIGHT + 1.2, 8);
		const towerMat = new THREE.MeshStandardMaterial({ color: "#8b7355", roughness: 0.9 });
		const topGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.25, 8);
		const topMat = new THREE.MeshStandardMaterial({ color: "#6b5640", roughness: 0.9 });
		this.disposables.push(towerGeo, towerMat, topGeo, topMat);
		const tower = new THREE.Mesh(towerGeo, towerMat);
		tower.position.y = (TOWER_HEIGHT - 1.2) / 2;
		const top = new THREE.Mesh(topGeo, topMat);
		top.position.y = TOWER_HEIGHT;
		this.object.add(tower, top);

		// Red player model as the archer.
		const body = playerModel.clone();
		body.traverse(o => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh) return;
			const m = mesh.material as THREE.MeshStandardMaterial;
			if (m.name === "skin") {
				mesh.material = m.clone();
				(mesh.material as THREE.MeshStandardMaterial).color.set("#b91c1c");
				this.disposables.push(mesh.material as THREE.Material);
			}
		});
		body.scale.setScalar(1.15);
		this.figure.add(body);

		const bowGeo = new THREE.TorusGeometry(0.42, 0.04, 6, 16, Math.PI);
		const bowMat = new THREE.MeshStandardMaterial({ color: "#5b3a1e", roughness: 0.8 });
		this.disposables.push(bowGeo, bowMat);
		this.bow = new THREE.Mesh(bowGeo, bowMat);
		this.bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
		this.bow.position.set(0, 0.65, -0.35);
		this.figure.add(this.bow);
		this.figure.position.y = TOWER_HEIGHT + 0.12;
		this.object.add(this.figure);
	}

	getObject() {
		return this.object;
	}

	frame(game: Game, dt: number) {
		this.draw = Math.max(0, this.draw - dt * 3);
		const crowd = game.crowdCenter();
		// Look at the crowd.
		this.figure.rotation.y = Math.atan2(-(crowd.x - this.position.x), -(crowd.z - this.position.z));

		const ahead = crowd.z - this.position.z; // > 0: crowd has not reached the archer yet
		if (game.phase !== "run" || game.crowdSize() === 0 || ahead > RANGE_BEFORE || ahead < -RANGE_AFTER) return;

		this.cooldown -= dt;
		if (this.cooldown > 0) return;
		this.cooldown = this.interval;
		this.draw = 1;

		this.bowPos.set(this.position.x, TOWER_HEIGHT + 1, this.position.z);
		// Aim at where the crowd will be when the arrow lands.
		const jitter = (Math.random() - 0.5) * 0.6;
		this.target.set(crowd.x + jitter, 0, crowd.z - game.speed * FLIGHT);
		game.addProp(new ArcherArrow(this.arrowModel, this.bowPos, this.target, FLIGHT));
	}

	update() {
		super.update();
		this.bow.scale.set(1, 1, 1 + this.draw * 0.3);
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}
}
