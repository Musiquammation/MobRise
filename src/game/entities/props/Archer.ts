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
const BOW_RADIUS = 0.55;
/** How far the string is pulled back at full draw. */
const DRAW_LENGTH = 0.35;

/** Stands on a tower next to the track and shoots arrows at the crowd. */
export class Archer extends Entity {
	private readonly object = new THREE.Group();
	private readonly figure = new THREE.Group();
	private readonly bow = new THREE.Group();
	private readonly strings: THREE.Mesh[] = [];
	/** Arrow on the string, hidden right after a shot. */
	private readonly nocked = new THREE.Group();
	private readonly disposables: { dispose(): void }[] = [];
	private cooldown: number;
	private draw = 0;
	private readonly bowPos = new THREE.Vector3();
	private readonly target = new THREE.Vector3();

	constructor(
		playerModel: THREE.Object3D,
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

		// Bow held at arm's length in front of the archer: vertical, bulging
		// toward the target, light wood so it stands out from the red body.
		const bowGeo = new THREE.TorusGeometry(BOW_RADIUS, 0.06, 6, 20, Math.PI)
			.rotateZ(-Math.PI / 2)
			.rotateY(Math.PI / 2);
		const bowMat = new THREE.MeshStandardMaterial({ color: "#e8b04a", roughness: 0.6 });
		const stringGeo = new THREE.CylinderGeometry(0.015, 0.015, 1, 4).translate(0, 0.5, 0);
		const stringMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
		const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5).rotateX(Math.PI / 2);
		const tipGeo = new THREE.ConeGeometry(0.06, 0.16, 5).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
		const shaftMat = new THREE.MeshStandardMaterial({ color: "#7a4a1f", roughness: 0.8 });
		const tipMat = new THREE.MeshStandardMaterial({ color: "#cfd4dc", metalness: 0.6, roughness: 0.3 });
		this.disposables.push(bowGeo, bowMat, stringGeo, stringMat, shaftGeo, tipGeo, shaftMat, tipMat);

		this.bow.position.set(-0.12, 0.78, -0.5);
		this.bow.rotation.x = 0.35; // aims up a bit: arrows fly in an arc
		this.bow.add(new THREE.Mesh(bowGeo, bowMat));
		for (const tip of [1, -1]) {
			const string = new THREE.Mesh(stringGeo, stringMat);
			string.position.set(0, tip * BOW_RADIUS, 0);
			this.strings.push(string);
			this.bow.add(string);
		}
		this.nocked.add(new THREE.Mesh(shaftGeo, shaftMat), new THREE.Mesh(tipGeo, tipMat));
		this.bow.add(this.nocked);
		this.figure.add(this.bow);
		this.figure.position.y = TOWER_HEIGHT + 0.12;
		this.object.add(this.figure);
	}

	getObject() {
		return this.object;
	}

	frame(game: Game, dt: number) {
		const crowd = game.crowdCenter();
		// Look at the crowd.
		this.figure.rotation.y = Math.atan2(-(crowd.x - this.position.x), -(crowd.z - this.position.z));

		const ahead = crowd.z - this.position.z; // > 0: crowd has not reached the archer yet
		if (game.phase !== "run" || game.crowdSize() === 0 || ahead > RANGE_BEFORE || ahead < -RANGE_AFTER) {
			this.draw = Math.max(0, this.draw - dt * 3);
			return;
		}

		this.cooldown -= dt;
		// Pulls the string during the second half of the reload.
		this.draw = Math.max(0, Math.min(1, 2 - (2 * this.cooldown) / this.interval));
		if (this.cooldown > 0) return;
		this.cooldown = this.interval;
		this.draw = 0;

		this.bowPos.set(this.position.x, TOWER_HEIGHT + 1, this.position.z);
		// Aim at where the crowd will be when the arrow lands.
		const jitter = (Math.random() - 0.5) * 0.6;
		this.target.set(crowd.x + jitter, 0, crowd.z - game.speed * FLIGHT);
		game.addProp(new ArcherArrow(this.bowPos, this.target, FLIGHT));
	}

	update() {
		super.update();
		// String: two segments from the tips of the bow to the nocking point.
		const back = this.draw * DRAW_LENGTH;
		for (const string of this.strings) {
			const h = -string.position.y;
			string.scale.y = Math.hypot(h, back);
			string.rotation.x = Math.atan2(back, h);
		}
		this.nocked.visible = this.cooldown < this.interval * 0.75;
		this.nocked.position.z = back - 0.45;
	}

	dispose() {
		for (const d of this.disposables) d.dispose();
	}
}
