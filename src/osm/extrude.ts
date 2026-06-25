import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { projectLonLat } from './project.js';

/**
 * Classify building type from OSM tags.
 * 0 = residential, 1 = commercial, 2 = unknown
 */
function classifyBuilding(props: Record<string, unknown>): number {
  const building = String(props['building'] ?? '').toLowerCase();
  if (['residential', 'house', 'apartments'].includes(building)) return 0;
  if (['commercial', 'retail', 'office'].includes(building)) return 1;
  return 2;
}

/**
 * Extract height in meters from OSM properties.
 * Priority: height tag → building:levels * 3.5 → 10m default
 */
function extractHeight(props: Record<string, unknown>): number {
  const heightRaw = props['height'];
  if (heightRaw !== undefined && heightRaw !== null) {
    const h = parseFloat(String(heightRaw));
    if (!isNaN(h) && h > 0) return h;
  }
  const levelsRaw = props['building:levels'];
  if (levelsRaw !== undefined && levelsRaw !== null) {
    const l = parseFloat(String(levelsRaw));
    if (!isNaN(l) && l > 0) return l * 3.5;
  }
  return 10;
}

/**
 * Build a THREE.Shape from an array of [lon, lat] ring coordinates.
 */
function ringToShape(ring: number[][]): THREE.Shape {
  const shape = new THREE.Shape();
  const [x0, z0] = projectLonLat(ring[0][0], ring[0][1]);
  shape.moveTo(x0, z0);
  for (let i = 1; i < ring.length; i++) {
    const [x, z] = projectLonLat(ring[i][0], ring[i][1]);
    shape.lineTo(x, z);
  }
  shape.closePath();
  return shape;
}

/**
 * Create an extruded BufferGeometry from a polygon ring set, tagged with buildingType.
 */
function extrudePolygon(
  rings: number[][][],
  height: number,
  buildingType: number
): THREE.BufferGeometry {
  const shape = ringToShape(rings[0]);
  // Add holes
  for (let i = 1; i < rings.length; i++) {
    shape.holes.push(ringToShape(rings[i]) as unknown as THREE.Path);
  }

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: height,
    bevelEnabled: false,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Rotate so buildings stand upright: Three.js is Y-up, extrude is along Z
  geometry.rotateX(-Math.PI / 2);

  // Add buildingType attribute
  const vertexCount = geometry.attributes['position'].count;
  const buildingTypeArray = new Int32Array(vertexCount).fill(buildingType);
  geometry.setAttribute('buildingType', new THREE.BufferAttribute(buildingTypeArray, 1));

  return geometry;
}

/**
 * Extrude all building features from a GeoJSON FeatureCollection into a
 * single merged BufferGeometry with a buildingType vertex attribute.
 */
export function extrudeBuildings(geojson: FeatureCollection): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];

  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const height = extractHeight(props);
    const buildingType = classifyBuilding(props);

    const geomType = feature.geometry?.type;

    if (geomType === 'Polygon') {
      const polygon = feature.geometry as Polygon;
      try {
        const geo = extrudePolygon(polygon.coordinates as number[][][], height, buildingType);
        geometries.push(geo);
      } catch {
        // Skip degenerate polygons
      }
    } else if (geomType === 'MultiPolygon') {
      const multiPolygon = feature.geometry as MultiPolygon;
      for (const rings of multiPolygon.coordinates as number[][][][]) {
        try {
          const geo = extrudePolygon(rings as number[][][], height, buildingType);
          geometries.push(geo);
        } catch {
          // Skip degenerate polygons
        }
      }
    }
  }

  if (geometries.length === 0) {
    throw new Error('No building geometries');
  }

  const merged = mergeGeometries(geometries, false);
  if (!merged) {
    throw new Error('Failed to merge building geometries');
  }

  // Dispose individual geometries
  for (const g of geometries) g.dispose();

  return merged;
}
