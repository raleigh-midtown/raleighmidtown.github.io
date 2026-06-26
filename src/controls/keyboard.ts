import * as THREE from 'three';

const FORWARD_KEYS  = new Set(['w', 'arrowup']);
const BACKWARD_KEYS = new Set(['s', 'arrowdown']);
const LEFT_KEYS     = new Set(['a', 'arrowleft']);
const RIGHT_KEYS    = new Set(['d', 'arrowright']);
const RUN_KEYS      = new Set(['shift']);

export class KeyboardState {
  private pressed = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.pressed.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => {
      this.pressed.delete(e.key.toLowerCase());
    });
  }

  isRunning(): boolean {
    for (const key of this.pressed) {
      if (RUN_KEYS.has(key)) return true;
    }
    return false;
  }

  isMoving(): boolean {
    for (const key of this.pressed) {
      if (
        FORWARD_KEYS.has(key) ||
        BACKWARD_KEYS.has(key) ||
        LEFT_KEYS.has(key) ||
        RIGHT_KEYS.has(key)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns movement vector in local camera space.
   * x: -1 left, +1 right
   * y: -1 forward, +1 backward
   */
  getMovementVector(): THREE.Vector2 {
    let x = 0;
    let y = 0;
    for (const key of this.pressed) {
      if (FORWARD_KEYS.has(key)) y -= 1;
      if (BACKWARD_KEYS.has(key)) y += 1;
      if (LEFT_KEYS.has(key)) x -= 1;
      if (RIGHT_KEYS.has(key)) x += 1;
    }
    // Normalize diagonal movement
    if (x !== 0 && y !== 0) {
      const len = Math.sqrt(x * x + y * y);
      x /= len;
      y /= len;
    }
    return new THREE.Vector2(x, y);
  }
}
