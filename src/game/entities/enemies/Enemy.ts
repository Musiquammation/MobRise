import * as THREE from "three";
import { Entity } from "../../Entity";
import type { Game } from "../../Game";
import { GRAVITY } from "../Player";

/**
 * Red enemy waiting on the track.
 * - idle:  waits for the crowd
 * - run:   charges the crowd (moved by crowdPhysics, see Game)
 * - fall:  fell into a hole
 * - dying: death animation
 */
export type EnemyState = "idle" | "run" | "fall" | "dying";

const DEATH_TIME = 0.45;

export class Enemy extends Entity {
	state: EnemyState = "idle";
	readonly velocity = new THREE.Vector3();
	readonly prev = new THREE.Vector3();
	yaw = Math.PI; // facing the incoming crowd
	spin = 0;
	scale = 1;
	readonly animPhase = Math.random() * Math.PI * 2;
	private deathTime = 0;

	constructor(x: number, z: number, readonly group: number) {
		super();
		this.position.set(x, 0, z);
	}

	getObject() {
		return null; // rendered by a PlayerRenderer (instancing)
	}

	die(vx: number, vy: number, vz: number) {
		if (this.state === "dying") return;
		this.state = "dying";
		this.deathTime = 0;
		this.velocity.set(vx, vy, vz);
	}

	frame(game: Game, dt: number) {
		switch (this.state) {
		case "run": {
			const dx = this.velocity.x, dz = this.velocity.z;
			if (dx * dx + dz * dz > 0.25) {
				let diff = Math.atan2(-dx, -dz) - this.yaw;
				diff = Math.atan2(Math.sin(diff), Math.cos(diff));
				this.yaw += diff * (1 - Math.exp(-10 * dt));
			}
			if (!game.isSupported(this.position.x, this.position.z)) {
				this.state = "fall";
				this.velocity.set(this.velocity.x * 0.3, 0, this.velocity.z * 0.3);
			}
			return;
		}
		case "fall":
			this.velocity.y += GRAVITY * 1.4 * dt;
			this.position.addScaledVector(this.velocity, dt);
			this.spin += dt * 4;
			if (this.position.y < -10) this.kill();
			return;
		case "dying":
			this.deathTime += dt;
			this.velocity.y += GRAVITY * dt;
			this.position.addScaledVector(this.velocity, dt);
			if (this.position.y < 0 && this.velocity.y < 0) {
				this.position.y = 0;
				this.velocity.set(this.velocity.x * 0.5, 0, this.velocity.z * 0.5);
			}
			this.spin = Math.min(Math.PI / 2, this.spin + dt * 8);
			this.scale = Math.max(0, 1 - (this.deathTime / DEATH_TIME) ** 2);
			if (this.deathTime >= DEATH_TIME) this.kill();
			return;
		}
	}
}
