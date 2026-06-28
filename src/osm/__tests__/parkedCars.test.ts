import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeCarGeometry, colorForIndex, CAR_COLORS } from '../parkedCars';

describe('makeCarGeometry', () => {
  it('returns a non-empty BufferGeometry with a position attribute', () => {
    const geo = makeCarGeometry();
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
    const pos = geo.getAttribute('position');
    expect(pos).toBeTruthy();
    expect(pos.count).toBeGreaterThan(0);
  });

  it('has a footprint longer (Z) than it is wide (X) so callers know the long axis', () => {
    const geo = makeCarGeometry();
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const lengthZ = bb.max.z - bb.min.z;
    const widthX = bb.max.x - bb.min.x;
    expect(lengthZ).toBeGreaterThan(widthX);
  });

  it('rests on the ground plane (min Y at or just above 0)', () => {
    const geo = makeCarGeometry();
    geo.computeBoundingBox();
    // Wheels are grounded at y=0; allow a float epsilon below zero.
    expect(geo.boundingBox!.min.y).toBeGreaterThan(-1e-4);
    expect(geo.boundingBox!.min.y).toBeLessThan(0.1);
  });

  it('bakes per-part vertex colours: black wheels and white body both present', () => {
    const geo = makeCarGeometry();
    const color = geo.getAttribute('color');
    expect(color).toBeTruthy();
    let hasBlack = false, hasWhite = false;
    const a = color.array;
    for (let i = 0; i < a.length; i += 3) {
      if (a[i] < 0.1 && a[i + 1] < 0.1 && a[i + 2] < 0.1) hasBlack = true;
      if (a[i] > 0.99 && a[i + 1] > 0.99 && a[i + 2] > 0.99) hasWhite = true;
    }
    expect(hasBlack).toBe(true);  // wheels stay black under any instance tint
    expect(hasWhite).toBe(true);  // body takes the per-instance palette colour
  });
});

describe('colorForIndex', () => {
  it('is deterministic and wraps at the palette length', () => {
    expect(colorForIndex(0).getHex()).toBe(colorForIndex(CAR_COLORS.length).getHex());
    expect(colorForIndex(1).getHex()).toBe(colorForIndex(CAR_COLORS.length + 1).getHex());
  });

  it('yields more than one distinct colour across the palette', () => {
    const hexes = new Set<number>();
    for (let i = 0; i < CAR_COLORS.length; i++) hexes.add(colorForIndex(i).getHex());
    expect(hexes.size).toBeGreaterThan(1);
  });
});
