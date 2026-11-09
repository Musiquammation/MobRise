import * as THREE from "three";
import { Entity } from "../Entity";
import type { Game } from "../Game";

const BUMP_TIME = 0.3;
const COIN_TIME = 0.7;

/**
 * "?" box of the cannon phase. Every box follows the same elliptic loop,
 * evenly spaced along it.
 */
export class MysteryBox extends Entity {
	private readonly object = new THREE.Group();
	private readonly box: THREE.Object3D;
	private readonly coin: THREE.Object3D;
	private bumpT = 0;
	private coinT = COIN_TIME;

	constructor(
		boxModel: THREE.Object3D,
		coinModel: THREE.Object3D,
		private readonly center: THREE.Vector3,
		private readonly rx: number,
		private readonly ry: number,
		/** Turns per second. */
		private readonly speed: number,
		/** Position along the loop, in [0, 1). */
		private readonly phase: number,
	) {
		super();
		this.box = boxModel.clone();
		this.coin = coinModel.clone();
		this.coin.visible = false;
		this.object.add(this.box, this.coin);
		this.hitboxHalf.set(0.75, 0.75, 0.75);
	}

	getObject() {
		return this.object;
	}

	bump() {
		this.bumpT = BUMP_TIME;
		this.coinT = 0;
	}

	frame(game: Game, dt: number) {
		const a = (game.time * this.speed + this.phase) * Math.PI * 2;
		this.position.set(
			this.center.x + Math.cos(a) * this.rx,
			this.center.y + Math.sin(a) * this.ry,
			this.center.z,
		);
		this.bumpT = Math.max(0, this.bumpT - dt);
		this.coinT += dt;
	}

	update() {
		super.update();
		const b = this.bumpT / BUMP_TIME;
		this.box.position.y = Math.sin(b * Math.PI) * 0.4;
		this.box.scale.setScalar(1 + Math.sin(b * Math.PI) * 0.15);

		const c = this.coinT / COIN_TIME;
		this.coin.visible = c < 1;
		if (this.coin.visible) {
			this.coin.position.y = 0.9 + c * 1.6;
			this.coin.rotation.y = c * Math.PI * 4;
			this.coin.scale.setScalar(1 - c * c * 0.6);
		}
	}
}
