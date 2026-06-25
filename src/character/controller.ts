import * as THREE from 'three';
import type { CharacterHandle } from './loader';
import type { KeyboardState } from '../controls/keyboard';

const MOVE_SPEED = 5; // m/s
const CROSSFADE_DURATION = 0.3;

export class CharacterController {
  private handle: CharacterHandle;
  private isWalking = false;
  // Reusable vectors to avoid per-frame allocations
  private readonly moveDir = new THREE.Vector3();
  private readonly worldDir = new THREE.Vector3();

  constructor(handle: CharacterHandle) {
    this.handle = handle;
  }

  update(
    delta: number,
    keyState: KeyboardState,
    cameraYaw: number,
    cameraRigReady: boolean,
  ): void {
    // Guard: do not move until camera rig has completed its first update
    if (!cameraRigReady) return;

    const mv = keyState.getMovementVector();
    const moving = keyState.isMoving();

    if (moving) {
      // Rotate movement vector by camera yaw to get world-space direction
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      this.worldDir.set(
        mv.x * cos + mv.y * sin,
        0,
        mv.x * (-sin) + mv.y * cos,
      ).normalize();

      // Apply velocity
      this.handle.model.position.addScaledVector(this.worldDir, MOVE_SPEED * delta);

      // Face movement direction
      if (this.worldDir.lengthSq() > 0.001) {
        const targetAngle = Math.atan2(this.worldDir.x, this.worldDir.z);
        this.handle.model.rotation.y = targetAngle;
      }

      // Transition to walking
      if (!this.isWalking) {
        this.crossfadeTo('walk');
        this.isWalking = true;
      }
    } else {
      // Transition to idle
      if (this.isWalking) {
        this.crossfadeTo('idle');
        this.isWalking = false;
      }
    }

    // Advance animation mixer
    if (this.handle.mixer) {
      this.handle.mixer.update(delta);
    }
  }

  private crossfadeTo(target: 'idle' | 'walk'): void {
    if (!this.handle.mixer) return; // Guard: placeholder character has no mixer

    const from = target === 'idle' ? this.handle.actions.walk : this.handle.actions.idle;
    const to = target === 'idle' ? this.handle.actions.idle : this.handle.actions.walk;

    if (!to) return;

    if (from) {
      to.reset().play();
      from.crossFadeTo(to, CROSSFADE_DURATION, true);
    } else {
      to.reset().play();
    }
  }

  getPosition(): THREE.Vector3 {
    return this.handle.model.position;
  }
}
