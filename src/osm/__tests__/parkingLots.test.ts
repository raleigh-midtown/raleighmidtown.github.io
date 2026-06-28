import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { FeatureCollection } from 'geojson';
import { buildParkingLots, isUnnamedParkingGarage } from '../parkingLots';

// Minimal parking polygon near scene CENTER (-78.640, 35.8385) so projected
// coordinates are small XZ offsets in world metres.
function mkParkingFeature(overrides: Record<string, unknown> = {}): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          amenity:  'parking',
          parking:  'multi-storey',
          building: 'parking',
          ...overrides,
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
      },
    ],
  };
}

// ── isUnnamedParkingGarage predicate ─────────────────────────────────────────

describe('isUnnamedParkingGarage', () => {
  it('returns true for matching unnamed parking feature', () => {
    expect(isUnnamedParkingGarage({
      amenity: 'parking', parking: 'multi-storey', building: 'parking',
    })).toBe(true);
  });

  it('returns false when name is present', () => {
    expect(isUnnamedParkingGarage({
      amenity: 'parking', parking: 'multi-storey', building: 'parking', name: 'Garage A',
    })).toBe(false);
  });

  it('returns false when building is not parking', () => {
    expect(isUnnamedParkingGarage({
      amenity: 'parking', parking: 'multi-storey', building: 'yes',
    })).toBe(false);
  });

  it('returns false when parking type is surface', () => {
    expect(isUnnamedParkingGarage({
      amenity: 'parking', parking: 'surface', building: 'parking',
    })).toBe(false);
  });

  it('returns false when amenity is missing', () => {
    expect(isUnnamedParkingGarage({
      parking: 'multi-storey', building: 'parking',
    })).toBe(false);
  });
});

// ── buildParkingLots ──────────────────────────────────────────────────────────

describe('buildParkingLots', () => {
  it('returns a THREE.Group from matching feature', () => {
    const group = buildParkingLots(mkParkingFeature());
    expect(group).toBeInstanceOf(THREE.Group);
  });

  it('happy path: matching polygon produces at least one Mesh child', () => {
    const group = buildParkingLots(mkParkingFeature());
    expect(group.children.length).toBeGreaterThan(0);
    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);

    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.map).toBeInstanceOf(THREE.CanvasTexture);

    const map = mat.map as THREE.CanvasTexture;
    expect(map.repeat.x).toBeCloseTo(1 / 2.5);
    expect(map.repeat.y).toBeCloseTo(1 / 5.0);
  });

  it('filter: named parking feature is skipped', () => {
    const group = buildParkingLots(mkParkingFeature({ name: 'Advanced Auto Parts Tower' }));
    expect(group.children.length).toBe(0);
  });

  it('filter: building=yes feature is skipped', () => {
    const group = buildParkingLots(mkParkingFeature({ building: 'yes' }));
    expect(group.children.length).toBe(0);
  });

  it('filter: parking=surface (no multi-storey) feature is skipped', () => {
    const group = buildParkingLots(mkParkingFeature({ parking: 'surface' }));
    expect(group.children.length).toBe(0);
  });

  it('edge: empty geojson returns empty group', () => {
    const group = buildParkingLots({ type: 'FeatureCollection', features: [] });
    expect(group.children.length).toBe(0);
  });

  it('edge: degenerate polygon (fewer than 3 unique vertices) returns empty group', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { amenity: 'parking', parking: 'multi-storey', building: 'parking' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-78.640, 35.8385], [-78.640, 35.8385]]],
        },
      }],
    };
    expect(() => buildParkingLots(fc)).not.toThrow();
    const group = buildParkingLots(fc);
    expect(group.children.length).toBe(0);
  });

  it('mesh has receiveShadow=true and renderOrder=1', () => {
    const group = buildParkingLots(mkParkingFeature());
    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.renderOrder).toBe(1);
  });

  it('material has dark asphalt color distinct from road color', () => {
    const group = buildParkingLots(mkParkingFeature());
    const mat = (group.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    // Parking asphalt (0x2a2826) must not be road asphalt (0x444444)
    expect(mat.color.getHex()).not.toBe(0x444444);
    expect(mat.color.getHex()).toBe(0x2a2826);
  });

  it('two matching features produce two children', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        ...(mkParkingFeature().features),
        {
          type: 'Feature',
          properties: { amenity: 'parking', parking: 'multi-storey', building: 'parking' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-78.6415, 35.8380],
              [-78.6410, 35.8380],
              [-78.6410, 35.8385],
              [-78.6415, 35.8385],
              [-78.6415, 35.8380],
            ]],
          },
        },
      ],
    };
    const group = buildParkingLots(fc);
    expect(group.children.length).toBe(2);
  });

  it('MultiPolygon feature produces one mesh per polygon', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { amenity: 'parking', parking: 'multi-storey', building: 'parking' },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [[
              [-78.6405, 35.8380],
              [-78.6395, 35.8380],
              [-78.6395, 35.8390],
              [-78.6405, 35.8390],
              [-78.6405, 35.8380],
            ]],
            [[
              [-78.6415, 35.8380],
              [-78.6410, 35.8380],
              [-78.6410, 35.8385],
              [-78.6415, 35.8385],
              [-78.6415, 35.8380],
            ]],
          ],
        },
      }],
    };

    const group = buildParkingLots(fc);
    expect(group.children.length).toBe(2);
  });
});
