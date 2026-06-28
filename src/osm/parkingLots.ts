import * as THREE from 'three';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { ringsToGeometry } from './util/shapes.js';
import { isUnnamedParkingGarage } from './util/osmPredicates.js';
import { makeStallTexture } from './util/stallTexture.js';
import { PARKING_Y, PARKING_COLOR, STALL_WIDTH, STALL_DEPTH } from './util/parkingSurface.js';

export { isUnnamedParkingGarage };

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
      // clone() preserves wrapS/wrapT, which makeStallTexture already sets to RepeatWrapping.
      map = texBase.clone() as THREE.CanvasTexture;
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
