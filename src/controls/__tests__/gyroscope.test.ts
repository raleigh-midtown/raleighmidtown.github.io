import { describe, it, expect, beforeEach } from 'vitest';
import { GyroscopeControls } from '../gyroscope';

function fireOrientation(alpha: number, beta: number) {
  window.dispatchEvent(
    new DeviceOrientationEvent('deviceorientation', { alpha, beta, gamma: 0, absolute: false })
  );
}

describe('GyroscopeControls', () => {
  let gyro: GyroscopeControls;

  beforeEach(() => {
    gyro = new GyroscopeControls();
  });

  it('isActive() returns false before any event', () => {
    expect(gyro.isActive()).toBe(false);
  });

  it('getCameraYaw() returns null when not active', () => {
    expect(gyro.getCameraYaw()).toBeNull();
  });

  it('getTiltForward() returns 0 when not active', () => {
    expect(gyro.getTiltForward()).toBe(0);
  });

  it('isActive() returns true after orientation event fires', async () => {
    // Non-iOS path: requestPermission calls startListening internally
    await gyro.requestPermission();
    fireOrientation(0, 45);
    expect(gyro.isActive()).toBe(true);
  });

  it('getCameraYaw() converts alpha to radians', async () => {
    await gyro.requestPermission();
    fireOrientation(180, 45);
    expect(gyro.getCameraYaw()).toBeCloseTo(-Math.PI);
  });

  it('getTiltForward() returns 0 in deadzone', async () => {
    await gyro.requestPermission();
    fireOrientation(0, 45);
    expect(gyro.getTiltForward()).toBe(0);
  });

  it('getTiltForward() returns positive when tilted forward', async () => {
    await gyro.requestPermission();
    fireOrientation(0, 80);
    expect(gyro.getTiltForward()).toBeGreaterThan(0);
  });

  it('getTiltForward() returns negative when tilted back', async () => {
    await gyro.requestPermission();
    fireOrientation(0, 10);
    expect(gyro.getTiltForward()).toBeLessThan(0);
  });

  it('destroy() disables the control', async () => {
    await gyro.requestPermission();
    fireOrientation(0, 45);
    expect(gyro.isActive()).toBe(true);
    gyro.destroy();
    expect(gyro.isActive()).toBe(false);
  });
});
