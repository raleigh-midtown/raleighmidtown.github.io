import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeStallTexture } from '../util/stallTexture';

describe('makeStallTexture', () => {
  it('returns a CanvasTexture with RepeatWrapping on both axes', () => {
    const tex = makeStallTexture();
    expect(tex).toBeInstanceOf(THREE.CanvasTexture);
    expect(tex!.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex!.wrapT).toBe(THREE.RepeatWrapping);
  });
});
