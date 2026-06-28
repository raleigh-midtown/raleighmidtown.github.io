import * as THREE from 'three';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { projectLonLat } from './project.js';

const PARKING_Y     = 0.08;
const PARKING_COLOR = 0x2a2826;  // dark asphalt, distinct from road asphalt (#444 in roads.ts)
const STALL_WIDTH   = 2.5;        // world metres per stall column
const STALL_DEPTH   = 5.0;        // world metres per stall row

/**
 * Returns true when an OSM feature is an unnamed multi-storey parking garage
 * tagged building=parking. These are rendered as flat surface lots; the same
 * predicate is used in extrude.ts to exclude them from building extrusion.
 * Keep both uses in sync — import this function rather than duplicating it.
 */
export function isUnnamedParkingGarage(props: Record<string, unknown>): boolean {
  return (
    String(props['amenity']  ?? '') === 'parking'      &&
    String(props['parking']  ?? '') === 'multi-storey' &&
    !props['name']                                     &&
    String(props['building'] ?? '') === 'parking'
  );
}

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
  if (rings[0].length < 4) return null;
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

const STALL_TEX_SIZE = 256;

/**
 * Draw an asphalt canvas with white stall-edge stripes along both axes.
 * The L-shaped corner stripe, when tiled with RepeatWrapping, produces a
 * full column-and-row stall grid across the lot surface.
 * Returns null when a 2D context is unavailable (non-browser environments).
 */
function makeStallTexture(): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = STALL_TEX_SIZE;
  canvas.height = STALL_TEX_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#2a2826';
  ctx.fillRect(0, 0, STALL_TEX_SIZE, STALL_TEX_SIZE);

  const stripeW = Math.max(2, Math.round(STALL_TEX_SIZE * 0.028));
  ctx.fillStyle = '#e8e8e8';
  // Vertical stripe at tile left → column dividers when tiled.
  ctx.fillRect(0, 0, stripeW, STALL_TEX_SIZE);
  // Horizontal stripe at tile top → row dividers when tiled.
  ctx.fillRect(0, 0, STALL_TEX_SIZE, stripeW);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Build flat asphalt surface geometry with stall-line markings for all OSM
 * parking polygons matching the isUnnamedParkingGarage filter.
 *
 * Each matching polygon gets its own Mesh with a cloned stall-line texture.
 * Because ShapeGeometry UVs are raw world-metre coordinates, a fixed
 * repeat=(1/STALL_WIDTH, 1/STALL_DEPTH) correctly tiles one stall per
 * stall-width metres across every lot regardless of polygon size.
 */
export function buildParkingLots(geojson: FeatureCollection): THREE.Group {
  const group = new THREE.Group();
  group.name = 'parkingLots';
  const texBase = makeStallTexture();

  const pushPolygon = (rings: number[][][]) => {
    const geo = ringsToGeometry(rings, PARKING_Y);
    if (!geo) return;

    let map: THREE.CanvasTexture | null = null;
    if (texBase) {
      // ShapeGeometry stores raw shape-space world-metre coordinates as UVs (not
      // normalised to [0,1]). repeat = 1/stallSize tiles one stall per stall-width
      // metres across the lot — correct regardless of individual polygon dimensions.
      map = texBase.clone() as THREE.CanvasTexture;
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(1 / STALL_WIDTH, 1 / STALL_DEPTH);
      map.needsUpdate = true;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: PARKING_COLOR,
      roughness: 0.95,
      metalness: 0,
      ...(map ? { map } : {}),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    group.add(mesh);
  };

  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    if (!isUnnamedParkingGarage(props)) continue;

    const geomType = feature.geometry?.type;
    if (geomType === 'Polygon') {
      pushPolygon((feature.geometry as Polygon).coordinates as number[][][]);
    } else if (geomType === 'MultiPolygon') {
      for (const rings of (feature.geometry as MultiPolygon).coordinates as number[][][][]) {
        pushPolygon(rings as number[][][]);
      }
    }
  }

  return group;
}
