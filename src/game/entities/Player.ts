import * as THREE from "three";
import { Entity } from "../Entity";
import type { Game } from "../Game";

/**
 * - run:    in the crowd (moved by crowdPhysics: attraction + collisions)
 * - fall:   fell into a hole / off the track
 * - gather: walks to the cannon at the end of the level (crowdPhysics too)
 * - flying: shot by the cannon
 * - dying:  death animation
 */
export type PlayerState = "run" | "fall" | "gather" | "flying" | "dying";

export const GRAVITY = -24;
/** Duration of the death animation. */
const DEATH_TIME = 0.45;

export class Player extends Entity {
	state: PlayerState = "run";
	/** While in the crowd: velocity relative to the crowd (x/z only). */
	readonly velocity = new THREE.Vector3();
	/** Used by crowdPhysics. */
	readonly prev = new THREE.Vector3();
	/** Facing angle around Y (0 = running direction). */
	yaw = 0;
	/** Tumble angle while flying. */
	spin = 0;
	/** Render scale (shrinks while dying). */
	scale = 1;
	private deathTime = 0;
	/** Random animation phase so the crowd does not bob in sync. */
	readonly animPhase = Math.random() * Math.PI * 2;

	constructor(x: number, y: number, z: number) {
		super();
		this.position.set(x, y, z);
		this.hitboxHalf.set(0.2, 0.5, 0.2);
		this.hitboxOffset.set(0, 0.5, 0);
	}

	getObject() {
		return null; // rendered by PlayerRenderer (instancing)
	}

	frame(game: Game, dt: number) {
		switch (this.state) {
		case "run": return this.run(game, dt);
		case "fall": return this.fall(game, dt);
		case "gather": return this.gather(game, dt);
		case "flying": return this.fly(game, dt);
		case "dying": return this.dying(dt);
		}
	}

	shoot(from: THREE.Vector3, velocity: THREE.Vector3) {
		this.state = "flying";
		this.position.copy(from);
		this.velocity.copy(velocity);
		this.hitboxHalf.set(0.35, 0.45, 0.35);
		this.hitboxOffset.set(0, 0.3, 0);
	}

	/** Plays the death animation (pushed by `v`, shrinks), then removes the player. */
	die(vx: number, vy: number, vz: number) {
		if (this.state === "dying") return;
		this.state = "dying";
		this.deathTime = 0;
		this.velocity.set(vx, vy, vz);
	}

	/** Throws the player in the air (jump pads). velocity.y is unused by crowdPhysics. */
	jump(power: number) {
		if (this.state !== "run" || this.position.y > 0.05) return;
		this.velocity.y = power;
		this.position.y = 0.06;
	}

	isAirborne(): boolean {
		return this.position.y > 0;
	}

	private run(game: Game, dt: number) {
		// Moved by crowdPhysics: only look where it is going.
		this.turnToward(this.velocity.x, this.velocity.z - game.speed, dt);

		if (this.position.y > 0) {
			this.velocity.y += GRAVITY * dt;
			this.position.y += this.velocity.y * dt;
			this.spin = Math.min(0.5, this.spin + dt * 2);
			if (this.position.y > 0) return;
			this.position.y = 0;
			this.velocity.y = 0;
			this.spin = 0;
		}

		if (!game.isSupported(this.position.x, this.position.z)) {
			this.state = "fall";
			this.velocity.set(0, Math.min(0, this.velocity.y), -game.speed * 0.5);
			game.markCrowdDirty();
		}
	}

	private fall(_game: Game, dt: number) {
		this.velocity.y += GRAVITY * 1.4 * dt;
		this.position.addScaledVector(this.velocity, dt);
		this.spin += dt * 4;
		if (this.position.y < -10) this.kill();
	}

	private dying(dt: number) {
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
	}

	private gather(game: Game, dt: number) {
		// Moved by crowdPhysics toward the cannon; enters it when close enough.
		const cannon = game.cannon.position;
		const dx = cannon.x - this.position.x;
		const dz = cannon.z - this.position.z;
		const dist = Math.hypot(dx, dz);
		if (dist < 0.8) {
			game.cannon.load();
			this.kill();
			return;
		}
		this.turnToward(this.velocity.x, this.velocity.z, dt);
	}

	/** Smoothly turns toward the direction (dx, dz) when moving. */
	private turnToward(dx: number, dz: number, dt: number) {
		if (dx * dx + dz * dz < 0.25) return;
		let diff = Math.atan2(-dx, -dz) - this.yaw;
		diff = Math.atan2(Math.sin(diff), Math.cos(diff));
		this.yaw += diff * (1 - Math.exp(-10 * dt));
	}

	private fly(game: Game, dt: number) {
		this.velocity.y += GRAVITY * dt;
		this.position.addScaledVector(this.velocity, dt);
		this.spin += dt * 12;
		if (this.position.y < -6 || this.position.z < game.boxCenter.z - 12) {
			game.onMiss();
			this.kill();
		}
	}
}
