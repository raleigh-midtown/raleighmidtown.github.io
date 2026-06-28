import * as THREE from 'three';

const FORWARD_KEYS  = new Set(['w', 'arrowup']);
const BACKWARD_KEYS = new Set(['s', 'arrowdown']);
const LEFT_KEYS     = new Set(['a', 'arrowleft']);
const RIGHT_KEYS    = new Set(['d', 'arrowright']);
const RUN_KEYS      = new Set(['shift']);
const CTRL_KEYS     = new Set(['control']);

export class KeyboardState {
  private pressed = new Set<string>();
  private jumpPending = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === ' ') {
        // Suppress page scroll on every Space keydown (including auto-repeat),
        // but edge-trigger the jump intent only on the press transition.
        e.preventDefault();
        if (!this.pressed.has(key)) this.jumpPending = true;
      }
      this.pressed.add(key);
    });
    window.addEventListener('keyup', (e) => {
      this.pressed.delete(e.key.toLowerCase());
    });
  }

  /** Returns true once per discrete Space press; clears the pending flag. */
  consumeJump(): boolean {
    if (this.jumpPending) {
      this.jumpPending = false;
      return true;
    }
    return false;
  }

  isCtrlHeld(): boolean {
    for (const key of this.pressed) {
      if (CTRL_KEYS.has(key)) return true;
    }
    return false;
  }

  /**
   * When Ctrl is held, ArrowUp/Down pitch the camera instead of moving.
   * Returns +1 (look up), -1 (look down), or 0.
   */
  getPitchInput(): number {
    if (!this.isCtrlHeld()) return 0;
    let v = 0;
    if (this.pressed.has('arrowup'))   v += 1;
    if (this.pressed.has('arrowdown')) v -= 1;
    return v;
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
    // When Ctrl is held, arrow keys control camera pitch — don't move the character
    const ctrlHeld = this.isCtrlHeld();
    for (const key of this.pressed) {
      if (ctrlHeld && (key === 'arrowup' || key === 'arrowdown')) continue;
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
