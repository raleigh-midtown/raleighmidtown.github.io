import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FeatureCollection } from 'geojson';
import { buildBenches, buildStreetBenches } from '../benches';

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

  it('group.name is benches', () => {
    expect(buildBenches(mkPark()).name).toBe('benches');
  });
});

// ── buildStreetBenches ────────────────────────────────────────────────────────

// ~100m square building polygon near CENTER to represent Park & Market.
function mkNamedBuilding(name: string): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { building: 'commercial', name },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-78.6405, 35.8380],
          [-78.6395, 35.8380],
          [-78.6395, 35.8390],
          [-78.6405, 35.8390],
          [-78.6405, 35.8380],
        ]],
      },
    }],
  };
}

function addAdjacentBuilding(fc: FeatureCollection): FeatureCollection {
  // Small building polygon directly north of the named building — will block
  // outward bench candidates on the north edge.
  fc.features.push({
    type: 'Feature',
    properties: { building: 'commercial' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-78.6406, 35.8390],
        [-78.6394, 35.8390],
        [-78.6394, 35.8396],
        [-78.6406, 35.8396],
        [-78.6406, 35.8390],
      ]],
    },
  });
  return fc;
}

describe('buildStreetBenches', () => {
  it('returns a THREE.Group', () => {
    expect(buildStreetBenches(mkNamedBuilding('Park & Market North Hills')))
      .toBeInstanceOf(THREE.Group);
  });

  it('happy path: Park & Market polygon → at least one bench mesh child', () => {
    const group = buildStreetBenches(mkNamedBuilding('Park & Market North Hills'));
    expect(group.children.length).toBeGreaterThan(0);
    expect(group.children[0]).toBeInstanceOf(THREE.Mesh);
  });

  it('happy path: The Eastern polygon → at least one bench mesh child', () => {
    const group = buildStreetBenches(mkNamedBuilding('The Eastern'));
    expect(group.children.length).toBeGreaterThan(0);
  });

  it('both buildings present → benches from both', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        ...(mkNamedBuilding('Park & Market North Hills').features),
        {
          type: 'Feature',
          properties: { building: 'commercial', name: 'The Eastern' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-78.6415, 35.8370],
              [-78.6410, 35.8370],
              [-78.6410, 35.8375],
              [-78.6415, 35.8375],
              [-78.6415, 35.8370],
            ]],
          },
        },
      ],
    };
    const group = buildStreetBenches(fc);
    const verts = group.children.length > 0
      ? (group.children[0] as THREE.Mesh).geometry.attributes.position.count
      : 0;
    // With two buildings we should have more bench vertices than with one alone.
    const single = buildStreetBenches(mkNamedBuilding('Park & Market North Hills'));
    const singleVerts = single.children.length > 0
      ? (single.children[0] as THREE.Mesh).geometry.attributes.position.count
      : 0;
    expect(verts).toBeGreaterThan(singleVerts);
  });

  it('named building not found → empty group, no crash', () => {
    const group = buildStreetBenches({ type: 'FeatureCollection', features: [] });
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(0);
  });

  it('group.name is streetBenches', () => {
    const group = buildStreetBenches(mkNamedBuilding('Park & Market North Hills'));
    expect(group.name).toBe('streetBenches');
  });

  it('bench candidates inside an adjacent building footprint are filtered out', () => {
    const noNeighbour   = buildStreetBenches(mkNamedBuilding('Park & Market North Hills'));
    const withNeighbour = buildStreetBenches(
      addAdjacentBuilding(mkNamedBuilding('Park & Market North Hills'))
    );
    const count = (g: THREE.Group) =>
      g.children.length > 0
        ? (g.children[0] as THREE.Mesh).geometry.attributes.position.count
        : 0;
    // Blocking building should suppress at least some bench candidates.
    expect(count(withNeighbour)).toBeLessThan(count(noNeighbour));
  });
});
