import * as THREE from 'three';
import type { CharacterHandle } from './loader';
import type { KeyboardState } from '../controls/keyboard';
import type { CollisionSystem } from '../collision/bvh';

const WALK_SPEED  = 5;            // m/s
const RUN_SPEED   = 12;           // m/s
const TURN_SPEED  = Math.PI * 1.8; // rad/s
const CROSSFADE_DURATION = 0.2;

// Vertical physics — felt-game gravity (~2× real), tuned for a ~2m apex.
const GRAVITY = 20;          // m/s^2
const JUMP_IMPULSE = 9;      // m/s
const LAND_SKIN = 0.02;      // m — within this distance of ground = grounded
const TUCK_BLEND_MS = 150;
const LAND_BLEND_MS = 150;

// Ground-probe geometry (named per maintainability review).
const HEAD_HEIGHT       = 1.7;   // m above pos.y — overhead clamp origin
const GROUND_PROBE_LIFT = 0.5;   // m above pos.y — downward raycast origin
const GROUND_PROBE_BASE = 1.0;   // m base depth; full depth = base + |vy*dt|

// Bones posed during a jump (Mixamo skeleton).
const POSED_BONES = [
  'mixamorigSpine',
  'mixamorigLeftUpLeg',
  'mixamorigLeftLeg',
  'mixamorigRightUpLeg',
  'mixamorigRightLeg',
  'mixamorigLeftArm',
  'mixamorigRightArm',
] as const;

// Tuck-pose target Euler offsets, added to each bone's bind orientation.
// Tuned by intuition; refine via U5 playtest.
const TUCK_EULERS: Record<string, THREE.Euler> = {
  mixamorigSpine:        new THREE.Euler( 0.20, 0, 0),
  mixamorigLeftUpLeg:    new THREE.Euler( 1.00, 0, 0),
  mixamorigRightUpLeg:   new THREE.Euler( 1.00, 0, 0),
  mixamorigLeftLeg:      new THREE.Euler(-1.20, 0, 0),
  mixamorigRightLeg:     new THREE.Euler(-1.20, 0, 0),
  mixamorigLeftArm:      new THREE.Euler( 0, 0,  0.40),
  mixamorigRightArm:     new THREE.Euler( 0, 0, -0.40),
};

export class CharacterController {
  private handle: CharacterHandle;
  private moveState: 'idle' | 'walk' | 'run' = 'idle';
  private airState: 'grounded' | 'airborne' = 'grounded';
  private verticalVelocity = 0;
  private readonly forward = new THREE.Vector3();

  // Pose bookkeeping — cache the bone references at capture time so the
  // hot-path applyPoseBlend doesn't traverse the scene graph every frame.
  private readonly posedBoneRefs: THREE.Object3D[] = [];
  private readonly bindQuats: THREE.Quaternion[] = [];
  private readonly tuckQuats: THREE.Quaternion[] = [];
  // "From" anchors captured at each transition — slerping from these instead
  // of bind eliminates the mixer-return pop on landing and re-take-off in
  // the land-blend window. See docs/solutions/design-patterns/
  // mixamo-bone-overlay-on-mixer-driven-animation.md rule 4.
  private readonly tuckFromQuats: THREE.Quaternion[] = [];
  private readonly landFromQuats: THREE.Quaternion[] = [];
  private posesCaptured = false;
  // -1 = no active blend; otherwise milliseconds since blend start
  private tuckStart = -1;
  private landStart = -1;

  // Raycast scratch
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _scratchQuat = new THREE.Quaternion();

  constructor(handle: CharacterHandle) {
    this.handle = handle;
  }

  update(
    delta: number,
    keyState: KeyboardState,
    cameraRigReady: boolean,
    collision?: CollisionSystem,
  ): void {
    if (!cameraRigReady) return;
    this.capturePosesOnce();

    // ── Horizontal motion (active grounded AND airborne — mid-air control) ──
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
    }

    // ── Locomotion state machine (grounded only — airborne pauses it) ──
    if (this.airState === 'grounded') {
      if (moving) {
        const targetState = running ? 'run' : 'walk';
        if (this.moveState !== targetState) {
          this.crossfadeTo(targetState);
          this.moveState = targetState;
        }
      } else if (this.moveState !== 'idle') {
        this.crossfadeTo('idle');
        this.moveState = 'idle';
      }
    }

    // ── Vertical physics ──
    const pos = this.handle.model.position;

    // Take-off
    if (keyState.consumeJump() && this.airState === 'grounded') {
      this.verticalVelocity = JUMP_IMPULSE;
      this.airState = 'airborne';
      this.tuckStart = 0;
      this.landStart = -1;
      this.stopLocomotion();
      this.captureFromQuats(this.tuckFromQuats);
    }

    // Gravity
    if (this.airState === 'airborne') {
      this.verticalVelocity -= GRAVITY * delta;
    }

    let candidateY = pos.y + this.verticalVelocity * delta;

    // Overhead clamp (only when ascending)
    if (collision && this.verticalVelocity > 0) {
      this._rayOrigin.set(pos.x, pos.y + HEAD_HEIGHT, pos.z);
      const upDist = collision.raycastUp(this._rayOrigin, this.verticalVelocity * delta + LAND_SKIN);
      if (upDist !== null) {
        candidateY = pos.y + (upDist - LAND_SKIN);
        this.verticalVelocity = 0;
      }
    }

    // Ground detection — ray from above feet, depth scales with fall speed.
    let groundY = 0;
    if (collision) {
      const probeOriginY = pos.y + GROUND_PROBE_LIFT;
      const probeMax = GROUND_PROBE_BASE + Math.abs(this.verticalVelocity * delta);
      this._rayOrigin.set(pos.x, probeOriginY, pos.z);
      const downDist = collision.raycastDown(this._rayOrigin, probeMax);
      if (downDist !== null) groundY = probeOriginY - downDist;
    }

    // Landing check / fall-off-edge transition
    if (candidateY - groundY < LAND_SKIN && this.verticalVelocity <= 0) {
      pos.y = groundY;
      if (this.airState === 'airborne') {
        this.airState = 'grounded';
        this.tuckStart = -1;
        this.landStart = 0;
        // Capture each posed bone's current (tucked) quaternion BEFORE
        // resumeLocomotion restarts the mixer — the land blend slerps from
        // this captured pose back toward tuck with factor (1-t), receding
        // gradually instead of snapping to bind at blend end.
        this.captureFromQuats(this.landFromQuats);
        this.resumeLocomotion(moving, running);
      }
      this.verticalVelocity = 0;
    } else {
      pos.y = candidateY;
      // Walking off elevated geometry (or any path that leaves us above ground
      // while grounded) — start falling so gravity takes over next frame.
      if (this.airState === 'grounded' && candidateY - groundY > LAND_SKIN) {
        this.airState = 'airborne';
        // Don't pose-tuck for an unintended fall; only jump take-off starts the
        // tuck blend. tuckStart stays -1 so the bone overrides don't fire.
      }
    }

    // ── Mixer step (must run before pose overrides) ──
    if (this.handle.mixer) {
      this.handle.mixer.update(delta);
    }

    // ── Pose blend (after mixer so manual writes win) ──
    this.applyPoseBlend(delta);
  }

  getYaw(): number {
    return this.handle.model.rotation.y;
  }

  getPosition(): THREE.Vector3 {
    return this.handle.model.position;
  }

  // ── Internals ──

  private crossfadeTo(target: 'idle' | 'walk' | 'run'): void {
    if (!this.handle.mixer) return;
    const actions = this.handle.actions;
    const to = target === 'idle' ? actions.idle
             : target === 'walk' ? actions.walk
             : actions.run;
    if (!to) return;
    const candidates = [actions.idle, actions.walk, actions.run];
    const from = candidates.find(a => a && a !== to && a.isRunning()) ?? null;
    to.reset().play();
    if (from) from.crossFadeTo(to, CROSSFADE_DURATION, true);
  }

  private stopLocomotion(): void {
    const a = this.handle.actions;
    a.idle?.stop();
    a.walk?.stop();
    a.run?.stop();
  }

  private resumeLocomotion(moving: boolean, running: boolean): void {
    const target: 'idle' | 'walk' | 'run' =
      moving ? (running ? 'run' : 'walk') : 'idle';
    this.moveState = target;
    this.crossfadeTo(target);
  }

  private capturePosesOnce(): void {
    if (this.posesCaptured) return;
    for (const name of POSED_BONES) {
      const bone = this.handle.model.getObjectByName(name);
      if (!bone) continue;
      const offset = TUCK_EULERS[name];
      this.posedBoneRefs.push(bone);
      this.bindQuats.push(bone.quaternion.clone());
      // tuck = bind * offset (apply offset in bone-local space)
      this.tuckQuats.push(
        bone.quaternion.clone().multiply(this._scratchQuat.setFromEuler(offset)),
      );
    }
    this.posesCaptured = true;
  }

  private captureFromQuats(target: THREE.Quaternion[]): void {
    target.length = 0;
    for (const bone of this.posedBoneRefs) {
      target.push(bone.quaternion.clone());
    }
  }

  /**
   * Apply the airborne tuck pose / landing release.
   *
   * Take-off blend: slerp from the captured pre-jump pose toward the tuck
   * target as `t` rises from 0 → 1. Anchoring on the captured pose (not bind)
   * means jumping while walking starts the blend from the live walk pose, not
   * a snap to T-pose.
   *
   * Land blend: the mixer writes a live locomotion pose to each bone every
   * frame; we pull that pose part-way toward the captured tuck by `1-t`. At
   * t=0 the bone is full tuck; at t=1 it's the unmodified mixer pose; in
   * between it eases out. At t=1 we stop touching the bone entirely so the
   * mixer's next write flows through cleanly — no bind snap, no pop.
   */
  private applyPoseBlend(delta: number): void {
    if (this.tuckStart >= 0) this.tuckStart += delta * 1000;
    if (this.landStart >= 0) this.landStart += delta * 1000;

    if (this.airState === 'airborne' && this.tuckStart >= 0) {
      const factor = Math.min(1, this.tuckStart / TUCK_BLEND_MS);
      for (let i = 0; i < this.posedBoneRefs.length; i++) {
        this.posedBoneRefs[i].quaternion
          .copy(this.tuckFromQuats[i])
          .slerp(this.tuckQuats[i], factor);
      }
      return;
    }

    if (this.airState === 'grounded' && this.landStart >= 0) {
      const t = Math.min(1, this.landStart / LAND_BLEND_MS);
      if (t >= 1) {
        this.landStart = -1;
        return;   // mixer's next write flows through untouched
      }
      const tuckInfluence = 1 - t;
      for (let i = 0; i < this.posedBoneRefs.length; i++) {
        // bone.quaternion was just set by mixer.update — pull it back toward
        // the tuck pose captured at touchdown by tuckInfluence amount.
        this.posedBoneRefs[i].quaternion.slerp(this.landFromQuats[i], tuckInfluence);
      }
    }
    // grounded with no active land-blend: nothing to do (mixer-only)
  }
}
