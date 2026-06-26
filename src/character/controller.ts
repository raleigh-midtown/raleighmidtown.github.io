import * as THREE from 'three';
import type { CharacterHandle } from './loader';
import type { KeyboardState } from '../controls/keyboard';

const WALK_SPEED  = 5;            // m/s
const RUN_SPEED   = 12;           // m/s
const TURN_SPEED  = Math.PI * 1.8; // rad/s
const CROSSFADE_DURATION = 0.2;

export class CharacterController {
  private handle: CharacterHandle;
  private moveState: 'idle' | 'walk' | 'run' = 'idle';
  private readonly forward = new THREE.Vector3();

  constructor(handle: CharacterHandle) {
    this.handle = handle;
  }

  update(
    delta: number,
    keyState: KeyboardState,
    cameraRigReady: boolean,
  ): void {
    if (!cameraRigReady) return;

    const mv = keyState.getMovementVector();
    const moving = keyState.isMoving();
    const running = moving && keyState.isRunning();
    const speed = running ? RUN_SPEED : WALK_SPEED;

    if (moving) {
      if (Math.abs(mv.x) > 0.01) {
        this.handle.model.rotation.y -= mv.x * TURN_SPEED * delta;
      }

      if (Math.abs(mv.y) > 0.01) {
        const yaw = this.handle.model.rotation.y;
        this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        this.handle.model.position.addScaledVector(this.forward, -mv.y * speed * delta);
      }

      const targetState = running ? 'run' : 'walk';
      if (this.moveState !== targetState) {
        this.crossfadeTo(targetState);
        this.moveState = targetState;
      }
    } else {
      if (this.moveState !== 'idle') {
        this.crossfadeTo('idle');
        this.moveState = 'idle';
      }
    }

    if (this.handle.mixer) {
      this.handle.mixer.update(delta);
    }
  }

  /** Returns current character yaw (rotation around Y axis). */
  getYaw(): number {
    return this.handle.model.rotation.y;
  }

  private crossfadeTo(target: 'idle' | 'walk' | 'run'): void {
    if (!this.handle.mixer) return;

    const actions = this.handle.actions;
    const to = target === 'idle' ? actions.idle
             : target === 'walk' ? actions.walk
             : actions.run;
    if (!to) return;

    // Find whichever action is currently playing to cross-fade from it.
    const candidates = [actions.idle, actions.walk, actions.run];
    const from = candidates.find(a => a && a !== to && a.isRunning()) ?? null;

    to.reset().play();
    if (from) from.crossFadeTo(to, CROSSFADE_DURATION, true);
  }

  getPosition(): THREE.Vector3 {
    return this.handle.model.position;
  }
}
