export class GyroscopeControls {
  private enabled = false;
  private alpha = 0; // DeviceOrientationEvent.alpha (compass heading, degrees)
  private beta = 0;  // DeviceOrientationEvent.beta (tilt front/back, degrees)
  private handler: ((e: DeviceOrientationEvent) => void) | null = null;

  constructor() {}

  /**
   * Request DeviceOrientation permission (iOS 13+ requires a user gesture).
   * On non-iOS or browsers that don't need permission, starts listening immediately.
   * Should be called from a button tap handler.
   * Returns a promise that resolves to 'granted' | 'denied' | 'unavailable'.
   */
  async requestPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
    // Check if DeviceOrientationEvent.requestPermission exists (iOS 13+)
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      try {
        const result = await (DeviceOrientationEvent as any).requestPermission();
        if (result === 'granted') {
          this.startListening();
          return 'granted';
        }
        return 'denied';
      } catch {
        return 'denied';
      }
    }
    // Non-iOS: check if DeviceOrientationEvent fires at all
    if (typeof DeviceOrientationEvent !== 'undefined') {
      this.startListening();
      return 'granted';
    }
    return 'unavailable';
  }

  /** True when enabled and receiving orientation events */
  isActive(): boolean {
    return this.enabled;
  }

  /**
   * Returns camera yaw override from device compass heading (alpha).
   * Returns null when not active — caller should use keyboard/mouse yaw instead.
   * alpha is in degrees (0-360), convert to radians, negate for Three.js Y-axis convention.
   */
  getCameraYaw(): number | null {
    if (!this.enabled) return null;
    return -(this.alpha * Math.PI / 180);
  }

  /**
   * Returns forward tilt as a movement scalar (-1 to 1).
   * beta is tilt in degrees: 0=flat, 90=upright portrait, negative=tilted back.
   * Deadzone: |beta - 45| < 10 → 0 (neutral held position ~45° in portrait)
   * Beyond deadzone: clamp to ±1 over a 30° range from the deadzone edge.
   */
  getTiltForward(): number {
    if (!this.enabled) return 0;
    const diff = this.beta - 45;
    if (Math.abs(diff) < 10) return 0;
    if (diff > 0) {
      // Tilted forward: diff > 10, deadzone edge at 10, scale over 30° range
      return Math.min(1, (diff - 10) / 30);
    } else {
      // Tilted back: diff < -10, deadzone edge at -10, scale over 30° range
      return Math.max(-1, (diff + 10) / 30);
    }
  }

  /** Stop listening and disable */
  destroy(): void {
    if (this.handler) {
      window.removeEventListener('deviceorientation', this.handler);
      this.handler = null;
    }
    this.enabled = false;
  }

  private startListening(): void {
    this.handler = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) this.alpha = e.alpha;
      if (e.beta !== null) this.beta = e.beta;
      this.enabled = true;
    };
    window.addEventListener('deviceorientation', this.handler);
  }
}
