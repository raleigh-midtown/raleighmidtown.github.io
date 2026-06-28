import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FeatureCollection } from 'geojson';
import { buildBenches } from '../benches';

// Helper: build a minimal GeoJSON with one named park polygon (a square ~50m
// per side in projected metres) and an optional building polygon that overlaps
// the park's north edge. Coordinates are intentionally close to the scene's
// CENTER (-78.640, 35.8385) so projectLonLat returns small XZ offsets.
function mkPark(): FeatureCollection {
  // ~50m square centered roughly on the scene origin
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { leisure: 'park', name: 'Midtown Park' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-78.6402, 35.8383],
            [-78.6398, 35.8383],
            [-78.6398, 35.8387],
            [-78.6402, 35.8387],
            [-78.6402, 35.8383],
          ]],
        },
      },
    ],
  };
}

function addBlockingBuilding(fc: FeatureCollection): FeatureCollection {
  // Building polygon covering the NORTH half of the park (lat 35.8385-35.8388 is the north band)
  fc.features.push({
    type: 'Feature',
    properties: { building: 'apartments', name: 'BlockingBlock' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-78.6403, 35.8385],
        [-78.6397, 35.8385],
        [-78.6397, 35.8390],
        [-78.6403, 35.8390],
        [-78.6403, 35.8385],
      ]],
    },
  });
  return fc;
}

describe('buildBenches', () => {
  it('returns an empty group when no Midtown Park polygon is present', () => {
    const group = buildBenches({ type: 'FeatureCollection', features: [] });
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children).toHaveLength(0);
  });

  it('places bench geometry on all viable park edges when there are no buildings', () => {
    const group = buildBenches(mkPark());
    expect(group.children.length).toBeGreaterThan(0);
    // Expect a single merged mesh with at least some bench tris.
    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('drops bench candidates that fall inside a building footprint', () => {
    const noBuilding = buildBenches(mkPark());
    const withBuilding = buildBenches(addBlockingBuilding(mkPark()));

    const tris = (g: THREE.Group) =>
      g.children.length > 0
        ? ((g.children[0] as THREE.Mesh).geometry.attributes.position.count)
        : 0;

    // The building blocks the north half of the park, so building-version
    // should have strictly fewer vertices than no-building version.
    expect(tris(withBuilding)).toBeLessThan(tris(noBuilding));
  });

  it('skips edges shorter than MIN_EDGE_LEN entirely', () => {
    // Build a "park" with one micro-edge (last vertex very close to first
    // non-closing vertex). The 4 main edges should still produce benches; the
    // micro-edge between near-duplicate vertices should be skipped silently.
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { leisure: 'park', name: 'Midtown Park' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-78.6402, 35.8383],
              [-78.6398, 35.8383],
              [-78.6398, 35.8387],
              [-78.64020001, 35.83870001],   // micro-edge starts here
              [-78.6402, 35.8387],
              [-78.6402, 35.8383],
            ]],
          },
        },
      ],
    };
    // No throw and produces benches.
    const group = buildBenches(fc);
    expect(group.children.length).toBeGreaterThan(0);
  });
});
