import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { CharacterController } from '../controller';
import type { CharacterHandle } from '../loader';

function makeHandle(withMixer = false): CharacterHandle {
  const model = new THREE.Object3D();
  const mixer = withMixer
    ? ({ update: vi.fn() } as unknown as THREE.AnimationMixer)
    : null;
  const makeAction = () =>
    ({
      reset: vi.fn().mockReturnThis(),
      play: vi.fn().mockReturnThis(),
      crossFadeTo: vi.fn().mockReturnThis(),
    }) as unknown as THREE.AnimationAction;

  return {
    model,
    mixer,
    actions: { idle: makeAction(), walk: makeAction() },
    isPlaceholder: !withMixer,
  };
}

function makeKeyState(moving: boolean, x = 0, y = -1) {
  return {
    isMoving: () => moving,
    getMovementVector: () => new THREE.Vector2(x, y),
  };
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
    ctrl.update(0.016, makeKeyState(true), 0, false);
    expect(handle.model.position.distanceTo(before)).toBe(0);
  });

  it('moves character forward (w key, yaw=0)', () => {
    ctrl.update(0.016, makeKeyState(true, 0, -1), 0, true);
    // yaw=0 → worldDir = (0, 0, -1), position.z decreases
    expect(handle.model.position.z).toBeLessThan(0);
  });

  it('advances mixer each frame', () => {
    ctrl.update(0.016, makeKeyState(false), 0, true);
    expect((handle.mixer!.update as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('transitions to walk animation when movement starts', () => {
    ctrl.update(0.016, makeKeyState(true, 0, -1), 0, true);
    expect((handle.actions.walk.reset as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('transitions to idle animation when movement stops', () => {
    ctrl.update(0.016, makeKeyState(true, 0, -1), 0, true);
    ctrl.update(0.016, makeKeyState(false), 0, true);
    expect((handle.actions.idle.reset as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('does not crossfade if already in same state', () => {
    ctrl.update(0.016, makeKeyState(false), 0, true);
    ctrl.update(0.016, makeKeyState(false), 0, true);
    // idle reset should only have been called once (first transition)
    expect((handle.actions.idle.reset as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('getPosition returns model position reference', () => {
    expect(ctrl.getPosition()).toBe(handle.model.position);
  });

  it('skips crossfade gracefully when mixer is null (placeholder)', () => {
    const ph = makeHandle(false);
    const phCtrl = new CharacterController(ph);
    expect(() => phCtrl.update(0.016, makeKeyState(true, 0, -1), 0, true)).not.toThrow();
  });
});
