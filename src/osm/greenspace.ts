import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { projectLonLat } from './project.js';

const COLOR_PARK  = 0x5A8A3A;
const COLOR_GRASS = 0x6A8F5A;
const COLOR_WOOD  = 0x3D6B3D;

function ringToShape(ring: number[][]): THREE.Shape {
  const shape = new THREE.Shape();
  const [x0, z0] = projectLonLat(ring[0][0], ring[0][1]);
  shape.moveTo(x0, -z0);
  for (let i = 1; i < ring.length; i++) {
    const [x, z] = projectLonLat(ring[i][0], ring[i][1]);
    shape.lineTo(x, -z);
  }
  shape.closePath();
  return shape;
}

function ringsToGeometry(rings: number[][][], y: number): THREE.BufferGeometry | null {
  if (rings[0].length < 3) return null;
  try {
    const shape = ringToShape(rings[0]);
    for (let i = 1; i < rings.length; i++) {
      shape.holes.push(ringToShape(rings[i]) as unknown as THREE.Path);
    }
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y, 0);
    return geo;
  } catch {
    return null;
  }
}

function classify(props: Record<string, unknown>): { color: number; y: number } | null {
  const leisure = String(props['leisure'] ?? '');
  const landuse = String(props['landuse'] ?? '');
  const natural = String(props['natural'] ?? '');
  if (leisure === 'park') return { color: COLOR_PARK, y: 0.04 };
  if (['grass', 'recreation_ground', 'park', 'garden', 'meadow', 'village_green'].includes(landuse))
    return { color: COLOR_GRASS, y: 0.03 };
  if (['wood', 'grassland', 'scrub'].includes(natural))
    return { color: COLOR_WOOD, y: 0.02 };
  return null;
}

export function buildGreenspaceGroup(geojson: FeatureCollection): THREE.Group {
  const buckets = new Map<number, THREE.BufferGeometry[]>();

  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const cls = classify(props);
    if (!cls) continue;

    const push = (rings: number[][][]) => {
      const geo = ringsToGeometry(rings, cls.y);
      if (!geo) return;
      if (!buckets.has(cls.color)) buckets.set(cls.color, []);
      buckets.get(cls.color)!.push(geo);
    };

    const geomType = feature.geometry?.type;
    if (geomType === 'Polygon') {
      push((feature.geometry as Polygon).coordinates as number[][][]);
    } else if (geomType === 'MultiPolygon') {
      for (const rings of (feature.geometry as MultiPolygon).coordinates as number[][][][]) {
        push(rings as number[][][]);
      }
    }
  }

  const group = new THREE.Group();
  for (const [color, geos] of buckets) {
    if (geos.length === 0) continue;
    let merged: THREE.BufferGeometry | null = null;
    if (geos.length === 1) {
      merged = geos[0];
    } else {
      merged = mergeGeometries(geos, false);
      if (merged) for (const g of geos) g.dispose();
    }
    if (!merged) continue;
    const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0 });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 0;   // draw before roads (renderOrder=1)
    group.add(mesh);
  }
  return group;
}
