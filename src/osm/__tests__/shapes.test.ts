import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { sceneRingToShape, shapeToGroundGeometry, ringsToGeometry } from '../util/shapes';

// A 10x5 rectangle in scene-metre XZ coords.
const RECT: number[][] = [[0, 0], [10, 0], [10, 5], [0, 5]];

describe('sceneRingToShape', () => {
  it('maps XZ points into the shape plane with a negated Z (moveTo(x, -z))', () => {
    const pts = sceneRingToShape(RECT).extractPoints(1).shape;
    // First four points correspond to the input corners with z negated.
    expect(pts[0].x).toBeCloseTo(0);  expect(pts[0].y).toBeCloseTo(0);
    expect(pts[1].x).toBeCloseTo(10); expect(pts[1].y).toBeCloseTo(0);
    expect(pts[2].x).toBeCloseTo(10); expect(pts[2].y).toBeCloseTo(-5);
    expect(pts[3].x).toBeCloseTo(0);  expect(pts[3].y).toBeCloseTo(-5);
  });
});

describe('shapeToGroundGeometry', () => {
  it('produces a flat geometry sitting at height y', () => {
    const geo = shapeToGroundGeometry(sceneRingToShape(RECT), 0.08);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0.08);
    expect(bb.max.y).toBeCloseTo(0.08); // flat: all vertices at y
    expect(bb.max.x - bb.min.x).toBeCloseTo(10); // footprint preserved in X
  });

  it('stores raw world-metre coordinates as UVs (not normalised to [0,1])', () => {
    const geo = shapeToGroundGeometry(sceneRingToShape(RECT), 0);
    const uv = geo.getAttribute('uv');
    let maxU = -Infinity;
    for (let i = 0; i < uv.count; i++) maxU = Math.max(maxU, uv.getX(i));
    // World-metre UVs → max U reaches the 10m width, not 1.0.
    expect(maxU).toBeCloseTo(10);
  });
});

describe('ringsToGeometry', () => {
  it('returns null for a degenerate ring (<4 vertices)', () => {
    expect(ringsToGeometry([[[-78.640, 35.8385], [-78.640, 35.8385]]], 0.08)).toBeNull();
  });

  it('builds a flat geometry at height y from a lon/lat ring', () => {
    const ring: number[][] = [
      [-78.6405, 35.8380], [-78.6395, 35.8380],
      [-78.6395, 35.8390], [-78.6405, 35.8390], [-78.6405, 35.8380],
    ];
    const geo = ringsToGeometry([ring], 0.08);
    expect(geo).not.toBeNull();
    geo!.computeBoundingBox();
    expect(geo!.boundingBox!.min.y).toBeCloseTo(0.08);
    expect(geo!.boundingBox!.max.y).toBeCloseTo(0.08);
  });
});
