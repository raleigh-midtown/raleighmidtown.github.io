import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import type { FeatureCollection } from 'geojson';
import { buildRoadParking } from '../roadParking';

// ~90m square near CENTER standing in for Park & Market North Hills. Its south
// edge (lat 35.8380, the lower latitude) projects to the +Z side, so its
// outward normal points +Z — the frontage buildRoadParking selects.
function mkPM(name = 'Park & Market North Hills'): FeatureCollection {
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

// Building covering the south frontage band — blocks the apron edge.
function addSouthBlocker(fc: FeatureCollection): FeatureCollection {
  fc.features.push({
    type: 'Feature',
    properties: { building: 'commercial' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-78.6406, 35.83788],
        [-78.6394, 35.83788],
        [-78.6394, 35.83795],
        [-78.6406, 35.83795],
        [-78.6406, 35.83788],
      ]],
    },
  });
  return fc;
}

function findApron(group: THREE.Group): THREE.Mesh | undefined {
  return group.children.find(
    c => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
  ) as THREE.Mesh | undefined;
}
function findCars(group: THREE.Group): THREE.InstancedMesh | undefined {
  return group.children.find(c => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh | undefined;
}

describe('buildRoadParking', () => {
  it('returns a THREE.Group named roadParking', () => {
    const g = buildRoadParking(mkPM());
    expect(g).toBeInstanceOf(THREE.Group);
    expect(g.name).toBe('roadParking');
  });

  it('happy path: produces an apron mesh and a car InstancedMesh with count > 0', () => {
    const g = buildRoadParking(mkPM());
    const apron = findApron(g);
    const cars = findCars(g);
    expect(apron).toBeInstanceOf(THREE.Mesh);
    expect(cars).toBeInstanceOf(THREE.InstancedMesh);
    expect(cars!.count).toBeGreaterThan(0);
  });

  it('apron uses dark asphalt, a CanvasTexture, receiveShadow, renderOrder 1', () => {
    const apron = findApron(buildRoadParking(mkPM()))!;
    const mat = apron.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0x2a2826);
    expect(mat.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(mat.map!.repeat.x).toBeCloseTo(1 / 2.5);
    expect(mat.map!.repeat.y).toBeCloseTo(1 / 5.0);
    expect(apron.receiveShadow).toBe(true);
    expect(apron.renderOrder).toBe(1);
  });

  it('car instanced material is white + vertexColors so baked colours survive the tint', () => {
    const cars = findCars(buildRoadParking(mkPM()))!;
    const mat = cars.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xffffff);
    expect(mat.vertexColors).toBe(true);
  });

  it('leaves some stalls vacant: parked car count is below the stall capacity', () => {
    const cars = findCars(buildRoadParking(mkPM()))!;
    // ~90 m south edge / 6 m spacing ≈ 15 stalls; ~65% occupancy leaves gaps.
    expect(cars.count).toBeGreaterThan(0);
    expect(cars.count).toBeLessThan(15);
  });

  it('cars carry more than one distinct per-instance colour', () => {
    const cars = findCars(buildRoadParking(mkPM()))!;
    expect(cars.instanceColor).toBeTruthy();
    const arr = cars.instanceColor!.array;
    const seen = new Set<string>();
    for (let i = 0; i < arr.length; i += 3) seen.add(`${arr[i]},${arr[i + 1]},${arr[i + 2]}`);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('cars are angled inward (nose tilts toward the building, not axis-aligned)', () => {
    const cars = findCars(buildRoadParking(mkPM()))!;
    const m = new THREE.Matrix4();
    cars.getMatrixAt(0, m);
    const nose = new THREE.Vector3(0, 0, 1).applyQuaternion(
      new THREE.Quaternion().setFromRotationMatrix(m),
    );
    // Angled parking off a +Z-facing frontage: the nose still has an inward
    // (-Z) component, but is tilted off the perpendicular (non-zero X).
    expect(nose.z).toBeLessThan(0);
    expect(Math.abs(nose.x)).toBeGreaterThan(0.3);
  });

  it('blocked frontage: a building over the apron band rejects the edge (empty group, no cars)', () => {
    const g = buildRoadParking(addSouthBlocker(mkPM()));
    expect(findCars(g)).toBeUndefined();
    // The band-clear test rejects the only +Z frontage edge, so no apron is laid
    // either — distinguishes this path from the apron-only zero-survivor path.
    expect(g.children.length).toBe(0);
  });

  it('building not found: empty group, no throw, warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const g = buildRoadParking(mkPM('Some Other Building'));
    expect(g.children.length).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('degenerate ring (<4 vertices): empty group, no throw', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { building: 'commercial', name: 'Park & Market North Hills' },
        geometry: { type: 'Polygon', coordinates: [[[-78.640, 35.8385], [-78.640, 35.8385]]] },
      }],
    };
    expect(() => buildRoadParking(fc)).not.toThrow();
    expect(buildRoadParking(fc).children.length).toBe(0);
  });
});
