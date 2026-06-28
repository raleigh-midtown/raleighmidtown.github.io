import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { CharacterController } from '../controller';
import type { CharacterHandle } from '../loader';
import type { KeyboardState } from '../../controls/keyboard';

function makeHandle(withMixer = false): CharacterHandle {
  const model = new THREE.Object3D();
  const mixer = withMixer
    ? ({ update: vi.fn() } as unknown as THREE.AnimationMixer)
    : null;
  const makeAction = () =>
    ({
      reset: vi.fn().mockReturnThis(),
      play: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      crossFadeTo: vi.fn().mockReturnThis(),
      isRunning: vi.fn().mockReturnValue(false),
    }) as unknown as THREE.AnimationAction;

  return {
    model,
    mixer,
    actions: { idle: makeAction(), walk: makeAction(), run: makeAction() },
    isPlaceholder: !withMixer,
  };
}

function makeKeyState(
  moving: boolean,
  x = 0,
  y = -1,
  running = false,
  jump = false,
): KeyboardState {
  return {
    isMoving: () => moving,
    isRunning: () => running,
    getMovementVector: () => new THREE.Vector2(x, y),
    consumeJump: () => jump,
  } as unknown as KeyboardState;
}

describe('CharacterController', () => {
  let handle: CharacterHandle;
  let ctrl: CharacterController;

  beforeEach(() => {
    handle = makeHandle(true);
    ctrl = new CharacterController(handle);
  });

  it('does not move when cameraRigReady is false', () => {
    const before = handle.model.position.clone();
    ctrl.update(0.016, makeKeyState(true), false);
    expect(handle.model.position.distanceTo(before)).toBe(0);
  });

  it('moves character forward (w key)', () => {
    // W key: mv.y = -1, model starts at rotation.y=0 so forward = (0,0,-1)
    ctrl.update(0.016, makeKeyState(true, 0, -1), true);
    expect(handle.model.position.z).toBeLessThan(0);
  });

  it('advances mixer each frame', () => {
    ctrl.update(0.016, makeKeyState(false), true);
    expect((handle.mixer!.update as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('transitions to walk animation when movement starts', () => {
    ctrl.update(0.016, makeKeyState(true, 0, -1), true);
    expect((handle.actions.walk!.reset as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('transitions to idle animation when movement stops', () => {
    ctrl.update(0.016, makeKeyState(true, 0, -1), true);
    ctrl.update(0.016, makeKeyState(false), true);
    expect((handle.actions.idle!.reset as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('does not crossfade if already in same state', () => {
    ctrl.update(0.016, makeKeyState(false), true);
    ctrl.update(0.016, makeKeyState(false), true);
    // idle reset should only have been called once (first transition)
    expect((handle.actions.idle!.reset as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('getPosition returns model position reference', () => {
    expect(ctrl.getPosition()).toBe(handle.model.position);
  });

  it('skips crossfade gracefully when mixer is null (placeholder)', () => {
    const ph = makeHandle(false);
    const phCtrl = new CharacterController(ph);
    expect(() => phCtrl.update(0.016, makeKeyState(true, 0, -1), true)).not.toThrow();
  });

  it('Space + grounded → launches character upward', () => {
    ctrl.update(0.016, makeKeyState(false, 0, 0, false, true), true);
    // After one 16ms frame with vy=9 and g=20: y = 9*0.016 - 0.5*20*0.016^2 = 0.1414
    expect(handle.model.position.y).toBeGreaterThan(0.1);
  });

  it('Space + airborne → ignored (no double-jump)', () => {
    ctrl.update(0.016, makeKeyState(false, 0, 0, false, true), true);
    const yAfterFirst = handle.model.position.y;
    // Second Space press while airborne: y should keep climbing per gravity, not re-impulse
    ctrl.update(0.016, makeKeyState(false, 0, 0, false, true), true);
    // Without double-jump: y2 - y1 ≈ (vy - g*dt) * dt = (9 - 20*0.016)*0.016 ≈ 0.1389
    // With double-jump: y2 - y1 would include a second 9 m/s impulse → much larger
    expect(handle.model.position.y - yAfterFirst).toBeLessThan(0.2);
  });

  it('mid-air horizontal input still moves the character', () => {
    ctrl.update(0.016, makeKeyState(false, 0, 0, false, true), true);   // launch
    const xBefore = handle.model.position.x;
    // Now airborne — apply W: forward with yaw=0 is -Z, so z should decrease
    ctrl.update(0.016, makeKeyState(true, 0, -1, false, false), true);
    expect(handle.model.position.x).toBeCloseTo(xBefore);    // no X drift
    expect(handle.model.position.z).toBeLessThan(0);          // moved forward in air
  });

  it('returns to ground after the full fall', () => {
    // Launch and step forward in time enough for full apex + fall
    ctrl.update(0.016, makeKeyState(false, 0, 0, false, true), true);
    for (let i = 0; i < 80; i++) {                            // ~1.28s of frames
      ctrl.update(0.016, makeKeyState(false), true);
    }
    expect(handle.model.position.y).toBeCloseTo(0, 5);
  });

  it('landing blend anchors on captured tuck pose, not bind — bones diverge from bind after t>=1', () => {
    // Add a stub mixamorigSpine bone to the model so capturePosesOnce wires it up.
    const spine = new THREE.Bone();
    spine.name = 'mixamorigSpine';
    handle.model.add(spine);

    // Take-off: capturePosesOnce runs and the take-off branch captures
    // tuckFromQuats. (Spine's TUCK_EULER is (0.20, 0, 0) so the bone will
    // start tilting on X — we don't pin a value here, just exercise the path.)
    ctrl.update(0.016, makeKeyState(false, 0, 0, false, true), true);

    // Free-fall until landing — many frames.
    for (let i = 0; i < 100; i++) {
      ctrl.update(0.016, makeKeyState(false), true);
    }

    // Simulate the mixer writing a non-identity pose every frame post-landing
    // by mutating the bone before each update. The pose-blend's land branch
    // should slerp this mixer-written value toward the captured tuck pose by
    // 1-t, then stop touching the bone once t >= 1.
    const mixerPose = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
    for (let i = 0; i < 12; i++) {
      spine.quaternion.copy(mixerPose);          // simulate mixer write
      ctrl.update(0.016, makeKeyState(false), true);
    }
    // After ~190ms (12 frames of 16ms) — past LAND_BLEND_MS (150ms) — the
    // blend should have released the bone and the mixer pose stands intact.
    expect(spine.quaternion.x).toBeCloseTo(mixerPose.x, 3);
    expect(spine.quaternion.y).toBeCloseTo(mixerPose.y, 3);
    expect(spine.quaternion.z).toBeCloseTo(mixerPose.z, 3);
    expect(spine.quaternion.w).toBeCloseTo(mixerPose.w, 3);
  });

  it('overhead clamp halts ascent when collision raycastUp returns a hit', () => {
    // Mock collision: raycastUp ALWAYS returns 0.05m (a low ceiling), raycastDown
    // returns origin.y so character is "grounded" when at y=0.
    const mockCollision = {
      raycastUp: vi.fn().mockReturnValue(0.05),
      raycastDown: (origin: THREE.Vector3) => origin.y,
    } as unknown as NonNullable<Parameters<CharacterController['update']>[3]>;

    ctrl.update(0.016, makeKeyState(false, 0, 0, false, true), true, mockCollision);
    const yAfterLaunch = handle.model.position.y;

    // With a tight ceiling, ascent should be clamped immediately — y stays under
    // the ceiling distance (0.05 - LAND_SKIN = 0.03) and stops rising.
    expect(yAfterLaunch).toBeLessThan(0.05);
    expect(mockCollision.raycastUp).toHaveBeenCalled();
  });
});
