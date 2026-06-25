import { describe, it, expect, beforeEach } from 'vitest';
import { KeyboardState } from '../keyboard';

// Helper to simulate key events
function keydown(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}
function keyup(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { key }));
}

describe('KeyboardState', () => {
  let kb: KeyboardState;

  beforeEach(() => {
    kb = new KeyboardState();
  });

  it('isMoving() returns false with no keys', () => {
    expect(kb.isMoving()).toBe(false);
  });

  it('isMoving() returns true with w held', () => {
    keydown('w');
    expect(kb.isMoving()).toBe(true);
    keyup('w');
  });

  it('getMovementVector() returns {x:0, y:-1} with w held alone', () => {
    keydown('w');
    const v = kb.getMovementVector();
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(-1);
    keyup('w');
  });

  it('getMovementVector() returns {x:-1, y:0} with a held alone', () => {
    keydown('a');
    const v = kb.getMovementVector();
    expect(v.x).toBeCloseTo(-1);
    expect(v.y).toBeCloseTo(0);
    keyup('a');
  });

  it('normalizes diagonal movement (w+d)', () => {
    keydown('w');
    keydown('d');
    const v = kb.getMovementVector();
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    expect(len).toBeCloseTo(1, 4);
    keyup('w');
    keyup('d');
  });

  it('arrow keys work as WASD', () => {
    keydown('ArrowUp');
    expect(kb.isMoving()).toBe(true);
    keyup('ArrowUp');
  });

  it('isMoving() returns false after all keys released', () => {
    keydown('w');
    keyup('w');
    expect(kb.isMoving()).toBe(false);
  });
});
