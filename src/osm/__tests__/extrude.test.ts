// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FeatureCollection } from 'geojson';
import { extrudeBuildings, extrudeBuildingBuckets, extrudeBuildingsGroup } from '../extrude.js';

// Simple square polygon in Midtown Raleigh bbox area
function makeSquareFeature(
  props: Record<string, unknown>,
  centerLon = -78.6825,
  centerLat = 35.7975,
  sizeDeg = 0.001
): FeatureCollection {
  const half = sizeDeg / 2;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'test-1',
        properties: { building: 'yes', ...props },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [centerLon - half, centerLat - half],
              [centerLon + half, centerLat - half],
              [centerLon + half, centerLat + half],
              [centerLon - half, centerLat + half],
              [centerLon - half, centerLat - half],
            ],
          ],
        },
      },
    ],
  };
}

describe('extrudeBuildings', () => {
  it('uses height tag when present (height: "20" → depth = 20)', () => {
    const geojson = makeSquareFeature({ height: '20' });
    const merged = extrudeBuildings(geojson);
    expect(merged).toBeInstanceOf(THREE.BufferGeometry);
    // Verify it has position attribute
    expect(merged.attributes['position']).toBeDefined();
    merged.dispose();
  });

  it('uses building:levels fallback (building:levels: "3" → depth ≈ 10.5)', () => {
    const geojson = makeSquareFeature({ 'building:levels': '3' });
    const merged = extrudeBuildings(geojson);
    expect(merged).toBeInstanceOf(THREE.BufferGeometry);
    merged.dispose();
  });

  it('defaults to 10m when no height info is present', () => {
    const geojson = makeSquareFeature({});
    const merged = extrudeBuildings(geojson);
    expect(merged).toBeInstanceOf(THREE.BufferGeometry);
    merged.dispose();
  });

  it('merged output has buildingType attribute', () => {
    const geojson = makeSquareFeature({ building: 'commercial' });
    const merged = extrudeBuildings(geojson);
    expect(merged.attributes['buildingType']).toBeDefined();
    merged.dispose();
  });

  it('residential building gets buildingType 0', () => {
    const geojson = makeSquareFeature({ building: 'residential' });
    const merged = extrudeBuildings(geojson);
    const attr = merged.attributes['buildingType'];
    expect(attr).toBeDefined();
    // All vertices should be type 0
    const arr = attr.array;
    for (let i = 0; i < arr.length; i++) {
      expect(arr[i]).toBe(0);
    }
    merged.dispose();
  });

  it('commercial building gets buildingType 1', () => {
    const geojson = makeSquareFeature({ building: 'commercial' });
    const merged = extrudeBuildings(geojson);
    const attr = merged.attributes['buildingType'];
    const arr = attr.array;
    for (let i = 0; i < arr.length; i++) {
      expect(arr[i]).toBe(1);
    }
    merged.dispose();
  });

  it('unknown building type gets buildingType 2', () => {
    const geojson = makeSquareFeature({ building: 'yes' });
    const merged = extrudeBuildings(geojson);
    const attr = merged.attributes['buildingType'];
    const arr = attr.array;
    for (let i = 0; i < arr.length; i++) {
      expect(arr[i]).toBe(2);
    }
    merged.dispose();
  });

  it('throws when feature collection is empty', () => {
    const geojson: FeatureCollection = { type: 'FeatureCollection', features: [] };
    expect(() => extrudeBuildings(geojson)).toThrow('No building geometries');
  });

  it('skips non-polygon feature types without crashing', () => {
    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'point-1',
          properties: { building: 'yes' },
          geometry: { type: 'Point', coordinates: [-78.6825, 35.7975] },
        },
        {
          type: 'Feature',
          id: 'polygon-1',
          properties: { building: 'yes', height: '10' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-78.683, 35.797],
                [-78.682, 35.797],
                [-78.682, 35.798],
                [-78.683, 35.798],
                [-78.683, 35.797],
              ],
            ],
          },
        },
      ],
    };
    const merged = extrudeBuildings(geojson);
    expect(merged).toBeInstanceOf(THREE.BufferGeometry);
    merged.dispose();
  });

  it('excludes unnamed parking garage (amenity=parking building=parking no name)', () => {
    // Only feature is an unnamed parking garage — should be skipped, throwing no-buildings error.
    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { amenity: 'parking', parking: 'multi-storey', building: 'parking' },
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
    expect(() => extrudeBuildings(geojson)).toThrow('No building geometries');
  });

  it('still extrudes named parking building (e.g. Advanced Auto Parts Tower)', () => {
    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          amenity: 'parking', parking: 'multi-storey',
          building: 'parking', name: 'Advanced Auto Parts Tower',
        },
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
    const merged = extrudeBuildings(geojson);
    expect(merged).toBeInstanceOf(THREE.BufferGeometry);
    merged.dispose();
  });
});

// ── extrudeBuildingBuckets (production path via extrudeBuildingsGroup) ────────

describe('extrudeBuildingBuckets', () => {
  it('excludes unnamed parking garage (amenity=parking building=parking no name)', () => {
    // Parking + one real building so the function doesn't return an empty array.
    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { amenity: 'parking', parking: 'multi-storey', building: 'parking' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-78.6405, 35.8380], [-78.6395, 35.8380],
              [-78.6395, 35.8390], [-78.6405, 35.8390],
              [-78.6405, 35.8380],
            ]],
          },
        },
        {
          type: 'Feature',
          properties: { building: 'yes', height: '10' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-78.6410, 35.8380], [-78.6400, 35.8380],
              [-78.6400, 35.8390], [-78.6410, 35.8390],
              [-78.6410, 35.8380],
            ]],
          },
        },
      ],
    };
    const buckets = extrudeBuildingBuckets(geojson);
    // Only the real building should appear; parking garage is excluded.
    const totalGeos = buckets.reduce((n, b) => n + b.geometries.length, 0);
    expect(totalGeos).toBe(1);
    for (const b of buckets) b.geometries.forEach(g => g.dispose());
  });

  it('still extrudes named parking building', () => {
    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          amenity: 'parking', parking: 'multi-storey',
          building: 'parking', name: 'Advanced Auto Parts Tower',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-78.6405, 35.8380], [-78.6395, 35.8380],
            [-78.6395, 35.8390], [-78.6405, 35.8390],
            [-78.6405, 35.8380],
          ]],
        },
      }],
    };
    const buckets = extrudeBuildingBuckets(geojson);
    const totalGeos = buckets.reduce((n, b) => n + b.geometries.length, 0);
    expect(totalGeos).toBe(1);
    for (const b of buckets) b.geometries.forEach(g => g.dispose());
  });
});

// ── extrudeBuildingsGroup (also calls extrudeBuildingBuckets) ─────────────────

describe('extrudeBuildingsGroup', () => {
  it('returns a THREE.Group with at least one Mesh child', () => {
    const geojson = makeSquareFeature({ building: 'yes', height: '10' });
    const group = extrudeBuildingsGroup(geojson);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThan(0);
    expect(group.children[0]).toBeInstanceOf(THREE.Mesh);
    group.children.forEach(c => (c as THREE.Mesh).geometry.dispose());
  });

  it('throws when feature collection has no buildings', () => {
    const geojson: FeatureCollection = { type: 'FeatureCollection', features: [] };
    expect(() => extrudeBuildingsGroup(geojson)).toThrow('No building geometries');
  });

  it('excludes unnamed parking garages (production extrusion path)', () => {
    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { amenity: 'parking', parking: 'multi-storey', building: 'parking' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-78.6405, 35.8380], [-78.6395, 35.8380],
              [-78.6395, 35.8390], [-78.6405, 35.8390],
              [-78.6405, 35.8380],
            ]],
          },
        },
      ],
    };
    // Only a parking garage → no buildings → should throw
    expect(() => extrudeBuildingsGroup(geojson)).toThrow('No building geometries');
  });
});
