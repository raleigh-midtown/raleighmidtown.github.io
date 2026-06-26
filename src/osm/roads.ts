import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FeatureCollection, Feature, LineString, MultiLineString } from 'geojson';
import { projectLonLat } from './project.js';

const Y = 0.05; // just above ground to avoid z-fighting

function halfWidthForHighway(hw: string): number {
  if (['motorway', 'trunk'].includes(hw)) return 4;
  if (hw === 'primary') return 3;
  if (hw === 'secondary') return 2.5;
  if (['tertiary', 'residential', 'unclassified', 'living_street'].includes(hw)) return 2;
  if (['service', 'alley'].includes(hw)) return 1.5;
  return 1.5;
}

function lineStringToRibbon(coords: number[][], halfW: number): THREE.BufferGeometry | null {
  if (coords.length < 2) return null;

  const pts = coords.map(([lon, lat]) => {
    const [x, z] = projectLonLat(lon, lat);
    return { x, z };
  });

  const vertices: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) continue;

    // Perpendicular to road direction in XZ plane
    const px = (-dz / len) * halfW;
    const pz = (dx / len) * halfW;

    const base = vertices.length / 3;
    vertices.push(a.x + px, Y, a.z + pz);
    vertices.push(a.x - px, Y, a.z - pz);
    vertices.push(b.x + px, Y, b.z + pz);
    vertices.push(b.x - px, Y, b.z - pz);

    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  if (vertices.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  return geo;
}

/** Build a flat road mesh group from a GeoJSON FeatureCollection containing highway ways. */
export function buildRoadsGroup(geojson: FeatureCollection): THREE.Group {
  const geos: THREE.BufferGeometry[] = [];

  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const hw = String(props['highway'] ?? '').toLowerCase();
    if (!hw) continue;

    // Skip pedestrian-only paths and footways to reduce noise
    if (['footway', 'path', 'steps', 'cycleway', 'track'].includes(hw)) continue;

    const halfW = halfWidthForHighway(hw);
    const geomType = feature.geometry?.type;

    if (geomType === 'LineString') {
      const geo = lineStringToRibbon(
        (feature.geometry as LineString).coordinates as number[][],
        halfW,
      );
      if (geo) geos.push(geo);
    } else if (geomType === 'MultiLineString') {
      for (const coords of (feature.geometry as MultiLineString).coordinates) {
        const geo = lineStringToRibbon(coords as number[][], halfW);
        if (geo) geos.push(geo);
      }
    }
  }

  const group = new THREE.Group();
  if (geos.length === 0) return group;

  const merged = mergeGeometries(geos, false);
  if (merged) {
    for (const g of geos) g.dispose();
    const mat = new THREE.MeshToonMaterial({ color: 0x3a3a4a });
    group.add(new THREE.Mesh(merged, mat));
  }

  return group;
}
