import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';
import { projectLonLat } from './project.js';

const KNOWN_HEIGHTS: Record<string, number> = {
  'The Eastern': 115, 'Captrust Tower': 79, 'Advanced Auto Parts Tower': 78,
  'Bank of America Tower': 63, 'Midtown Plaza': 55, 'Park Central North Hills': 56,
  'Hyatt House North Hills': 24, 'Midtown Green': 21, 'Park & Market North Hills': 21,
  'Renaissance Raleigh North Hills Hotel': 35, 'Landmark Center': 18,
  'The Lassiter at North Hills': 14,
};

function getHeight(props: Record<string, unknown>): number {
  const name = String(props['name'] ?? '');
  if (name && KNOWN_HEIGHTS[name] !== undefined) return KNOWN_HEIGHTS[name];
  const h = parseFloat(String(props['height'] ?? ''));
  if (!isNaN(h) && h > 0) return h;
  const l = parseFloat(String(props['building:levels'] ?? ''));
  if (!isNaN(l) && l > 0) return l * 3.5;
  const type = String(props['building'] ?? '').toLowerCase();
  if (['apartments', 'residential'].includes(type)) return 18;
  if (['commercial', 'office'].includes(type)) return 22;
  return 10;
}

function getRing(feature: Feature): number[][] | null {
  if (feature.geometry?.type === 'Polygon')
    return (feature.geometry as Polygon).coordinates[0] as number[][];
  if (feature.geometry?.type === 'MultiPolygon')
    return (feature.geometry as MultiPolygon).coordinates[0][0] as number[][];
  return null;
}

// Compute outward normal for edge [A→B] given building centroid
function outwardNormal(
  ax: number, az: number, bx: number, bz: number,
  centX: number, centZ: number
): [number, number] {
  const dx = bx - ax, dz = bz - az;
  const len = Math.sqrt(dx * dx + dz * dz);
  const udx = dx / len, udz = dz / len;
  const midX = (ax + bx) / 2, midZ = (az + bz) / 2;
  // Two candidate normals
  let nx = udz, nz = -udx;
  // Flip if pointing toward centroid
  if (nx * (centX - midX) + nz * (centZ - midZ) > 0) { nx = -nx; nz = -nz; }
  return [nx, nz];
}

// Thin slab protruding outward from facade segment [p0→p1]
function makeBalconySlab(
  p0x: number, p0z: number, p1x: number, p1z: number,
  nx: number, nz: number, y: number,
  depth: number, thickness: number
): THREE.BufferGeometry {
  const top = y + thickness;
  const d = depth;
  const verts = new Float32Array([
    // bottom quad
    p0x,        y,   p0z,
    p1x,        y,   p1z,
    p1x + nx*d, y,   p1z + nz*d,
    p0x + nx*d, y,   p0z + nz*d,
    // top quad
    p0x,        top, p0z,
    p1x,        top, p1z,
    p1x + nx*d, top, p1z + nz*d,
    p0x + nx*d, top, p0z + nz*d,
  ]);
  const idx = [
    4,5,6, 4,6,7,   // top face
    0,2,1, 0,3,2,   // bottom face (flipped)
    7,6,2, 7,2,3,   // outer face
    0,4,7, 0,7,3,   // left cap
    1,6,5, 1,2,6,   // right cap
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Thin railing bar across the outer edge of a balcony
function makeRailing(
  p0x: number, p0z: number, p1x: number, p1z: number,
  nx: number, nz: number, y: number, depth: number
): THREE.BufferGeometry {
  const rH = 1.0, rT = 0.06; // railing height and thickness
  const ox = nx * depth, oz = nz * depth;
  const verts = new Float32Array([
    p0x+ox-nx*rT, y,    p0z+oz-nz*rT,
    p1x+ox-nx*rT, y,    p1z+oz-nz*rT,
    p1x+ox+nx*rT, y,    p1z+oz+nz*rT,
    p0x+ox+nx*rT, y,    p0z+oz+nz*rT,
    p0x+ox-nx*rT, y+rH, p0z+oz-nz*rT,
    p1x+ox-nx*rT, y+rH, p1z+oz-nz*rT,
    p1x+ox+nx*rT, y+rH, p1z+oz+nz*rT,
    p0x+ox+nx*rT, y+rH, p0z+oz+nz*rT,
  ]);
  const idx = [4,5,6,4,6,7, 0,2,1,0,3,2, 7,6,2,7,2,3];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Dark recessed door rectangle on the facade
function makeDoorGeo(
  midX: number, midZ: number,
  udx: number, udz: number,
  nx: number, nz: number,
  width: number, height: number, inset: number
): THREE.BufferGeometry {
  const hw = width / 2;
  const verts = new Float32Array([
    midX - udx*hw + nx*inset, 0,      midZ - udz*hw + nz*inset,
    midX + udx*hw + nx*inset, 0,      midZ + udz*hw + nz*inset,
    midX + udx*hw + nx*inset, height, midZ + udz*hw + nz*inset,
    midX - udx*hw + nx*inset, height, midZ - udz*hw + nz*inset,
  ]);
  const idx = [0,1,2, 0,2,3];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function buildBuildingDetails(geojson: FeatureCollection): THREE.Group {
  const group = new THREE.Group();
  const balconyGeos: THREE.BufferGeometry[] = [];
  const railingGeos: THREE.BufferGeometry[] = [];
  const doorGeos: THREE.BufferGeometry[] = [];

  const FLOOR_H   = 3.5;
  const BAL_DEPTH = 1.2;
  const BAL_THICK = 0.16;
  const BAL_SPACING = 4.0;
  const BAL_WIDTH = 2.6;
  const DOOR_W = 1.8;
  const DOOR_H = 2.4;

  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    if (!props['building'] || props['building'] === 'roof') continue;

    const height = getHeight(props);
    if (height < 6) continue;

    const buildingType = String(props['building'] ?? '').toLowerCase();
    const isResidential = ['apartments', 'residential'].includes(buildingType);

    const ring = getRing(feature);
    if (!ring || ring.length < 4) continue;

    const pts: [number, number][] = ring.map(c => projectLonLat(c[0], c[1]));

    // Centroid
    let cxSum = 0, czSum = 0;
    pts.forEach(([x, z]) => { cxSum += x; czSum += z; });
    const centX = cxSum / pts.length, centZ = czSum / pts.length;

    const numFloors = Math.floor(height / FLOOR_H);
    let longestEdgeIdx = -1, longestLen = 0;

    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const edgeLen = Math.sqrt(dx*dx + dz*dz);
      if (edgeLen < 1.5) continue;

      if (edgeLen > longestLen) { longestLen = edgeLen; longestEdgeIdx = i; }

      if (!isResidential || edgeLen < BAL_SPACING) continue;

      const [nx, nz] = outwardNormal(ax, az, bx, bz, centX, centZ);
      const udx = dx / edgeLen, udz = dz / edgeLen;
      const numBal = Math.floor(edgeLen / BAL_SPACING);

      for (let b = 0; b < numBal; b++) {
        const t = (b + 0.5) * BAL_SPACING;
        const p0x = ax + udx * (t - BAL_WIDTH / 2);
        const p0z = az + udz * (t - BAL_WIDTH / 2);
        const p1x = ax + udx * (t + BAL_WIDTH / 2);
        const p1z = az + udz * (t + BAL_WIDTH / 2);

        // Start from 2nd floor, skip top floor
        for (let fl = 2; fl < numFloors - 1; fl++) {
          const flY = fl * FLOOR_H;
          try {
            balconyGeos.push(makeBalconySlab(p0x, p0z, p1x, p1z, nx, nz, flY, BAL_DEPTH, BAL_THICK));
            railingGeos.push(makeRailing(p0x, p0z, p1x, p1z, nx, nz, flY + BAL_THICK, BAL_DEPTH));
          } catch { /* skip degenerate */ }
        }
      }
    }

    // Door on longest edge
    if (longestEdgeIdx >= 0) {
      const [ax, az] = pts[longestEdgeIdx];
      const [bx, bz] = pts[longestEdgeIdx + 1];
      const dx = bx - ax, dz = bz - az;
      const edgeLen = Math.sqrt(dx*dx + dz*dz);
      const udx = dx / edgeLen, udz = dz / edgeLen;
      const midX = (ax + bx) / 2, midZ = (az + bz) / 2;
      const [nx, nz] = outwardNormal(ax, az, bx, bz, centX, centZ);
      try {
        doorGeos.push(makeDoorGeo(midX, midZ, udx, udz, nx, nz, DOOR_W, DOOR_H, 0.1));
      } catch { /* skip */ }
    }
  }

  const addMerged = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (geos.length === 0) return;
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) return;
    if (geos.length > 1) for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  addMerged(balconyGeos, new THREE.MeshStandardMaterial({ color: 0xc4bcac, flatShading: true, roughness: 0.88 }));
  addMerged(railingGeos, new THREE.MeshStandardMaterial({ color: 0x999490, flatShading: true, roughness: 0.6, metalness: 0.2 }));
  addMerged(doorGeos, new THREE.MeshStandardMaterial({
    color: 0x6090b8,
    metalness: 0.75,
    roughness: 0.08,
    transparent: true,
    opacity: 0.82,
  }));

  return group;
}
