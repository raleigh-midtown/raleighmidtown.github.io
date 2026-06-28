import * as THREE from 'three';
import type { FeatureCollection, Feature, LineString, MultiLineString } from 'geojson';
import { projectLonLat } from './project.js';
import {
  type Pt,
  type BBox,
  getRings,
  edgeOutwardNormal,
  polygonCentroid,
  isInsideAnyBuilding,
  collectBuildingBoxes,
} from './util/geom.js';

const LANE_WIDTH = 3.5;
const TREE_ROAD_BUFFER = 4.0;   // road half-width + canopy radius (~2m) + small margin

const SIDEWALK_WIDTH = 14;      // wide setback band — meets the road in most blocks
const SIDEWALK_Y     = 0.05;    // sits between greenspace (0.04) and road (0.10)
const TREE_SPACING   = 8;
const TREE_INSET     = 2.0;     // tree placement from outer edge of sidewalk
const MIN_PERIMETER  = 18;

// Mitered outward offset of a closed polygon ring by `dist`. Returns ring (last==first not included).
function offsetRing(ring: Pt[], cx: number, cz: number, dist: number): Pt[] {
  const N = ring.length - 1; // last == first
  // Per-edge outward normals
  const edges: Pt[] = [];
  for (let i = 0; i < N; i++) {
    edges.push(edgeOutwardNormal(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], cx, cz));
  }
  const out: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const ePrev = edges[(i - 1 + N) % N];
    const eNext = edges[i];
    let nx = ePrev[0] + eNext[0];
    let nz = ePrev[1] + eNext[1];
    const L = Math.sqrt(nx * nx + nz * nz);
    if (L < 1e-6) { nx = eNext[0]; nz = eNext[1]; }
    else { nx /= L; nz /= L; }
    const dot = nx * eNext[0] + nz * eNext[1];
    const m = dist / Math.max(0.35, Math.abs(dot));
    out.push([ring[i][0] + nx * m, ring[i][1] + nz * m]);
  }
  return out;
}

// Mirror of roads.ts lane-width logic so trees use the same effective road width.
function defaultLanes(hw: string): number {
  if (['motorway', 'trunk'].includes(hw)) return 4;
  if (hw === 'primary') return 4;
  if (hw === 'secondary') return 3;
  if (['tertiary', 'residential', 'unclassified', 'living_street'].includes(hw)) return 2;
  if (['service', 'alley'].includes(hw)) return 1;
  return 2;
}

interface RoadSeg { ax: number; az: number; bx: number; bz: number; halfW: number; }

function collectRoadSegments(geojson: FeatureCollection): RoadSeg[] {
  const segs: RoadSeg[] = [];
  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const hw = String(props['highway'] ?? '').toLowerCase();
    if (!hw) continue;
    if (['footway', 'path', 'steps', 'cycleway', 'track'].includes(hw)) continue;
    const lanesRaw = parseInt(String(props['lanes'] ?? ''), 10);
    const lanes = Number.isFinite(lanesRaw) && lanesRaw > 0 ? lanesRaw : defaultLanes(hw);
    const halfW = Math.max(1.5, (lanes * LANE_WIDTH) / 2);
    const push = (coords: number[][]) => {
      for (let i = 0; i < coords.length - 1; i++) {
        const [ax, az] = projectLonLat(coords[i][0], coords[i][1]);
        const [bx, bz] = projectLonLat(coords[i + 1][0], coords[i + 1][1]);
        segs.push({ ax, az, bx, bz, halfW });
      }
    };
    const g = feature.geometry;
    if (g?.type === 'LineString') push((g as LineString).coordinates as number[][]);
    else if (g?.type === 'MultiLineString') {
      for (const c of (g as MultiLineString).coordinates) push(c as number[][]);
    }
  }
  return segs;
}

// Distance from point P to segment A-B (XZ plane)
function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  if (L2 < 1e-6) {
    const ex = px - ax, ez = pz - az;
    return Math.sqrt(ex * ex + ez * ez);
  }
  let t = ((px - ax) * dx + (pz - az) * dz) / L2;
  t = Math.max(0, Math.min(1, t));
  const ex = px - (ax + t * dx), ez = pz - (az + t * dz);
  return Math.sqrt(ex * ex + ez * ez);
}

function isOnRoad(x: number, z: number, segs: RoadSeg[]): boolean {
  for (const s of segs) {
    if (distToSeg(x, z, s.ax, s.az, s.bx, s.bz) < s.halfW + TREE_ROAD_BUFFER) return true;
  }
  return false;
}

export function buildStreetscape(geojson: FeatureCollection): THREE.Group {
  const sidewalkVerts: number[] = [];
  const sidewalkIdx: number[] = [];

  const treePositions: [number, number][] = [];
  const roadSegs = collectRoadSegments(geojson);

  // Collect all building footprint bboxes + rings for point-in-building rejection.
  const buildingBoxes: BBox[] = collectBuildingBoxes(geojson);

  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    if (!props['building'] || props['building'] === 'roof') continue;

    for (const ringLL of getRings(feature)) {
      if (ringLL.length < 4) continue;
      const ring: Pt[] = ringLL.map(c => projectLonLat(c[0], c[1]));

      // Perimeter check
      let perim = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const dx = ring[i + 1][0] - ring[i][0];
        const dz = ring[i + 1][1] - ring[i][1];
        perim += Math.sqrt(dx * dx + dz * dz);
      }
      if (perim < MIN_PERIMETER) continue;

      const [cx, cz] = polygonCentroid(ring);

      const outer = offsetRing(ring, cx, cz, SIDEWALK_WIDTH);
      const N = outer.length;

      // Triangulate ring band: inner ring = ring[0..N-1], outer ring = outer[0..N-1]
      const base = sidewalkVerts.length / 3;
      for (let i = 0; i < N; i++) {
        // Inner vertex i (use building footprint vertex)
        sidewalkVerts.push(ring[i][0], SIDEWALK_Y, ring[i][1]);
      }
      for (let i = 0; i < N; i++) {
        // Outer vertex i
        sidewalkVerts.push(outer[i][0], SIDEWALK_Y, outer[i][1]);
      }
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const innerI = base + i;
        const innerJ = base + j;
        const outerI = base + N + i;
        const outerJ = base + N + j;
        // CCW from above so normal points UP. Outer normal already correctly oriented.
        sidewalkIdx.push(innerI, outerI, innerJ);
        sidewalkIdx.push(innerJ, outerI, outerJ);
      }

      // Tree positions: along outer edges, inset slightly inward, every TREE_SPACING
      for (let i = 0; i < N; i++) {
        const a = outer[i];
        const b = outer[(i + 1) % N];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const L = Math.sqrt(dx * dx + dz * dz);
        if (L < TREE_SPACING) continue;
        const ux = dx / L, uz = dz / L;
        // Inward (toward building centroid from this outer edge)
        const midX = (a[0] + b[0]) / 2, midZ = (a[1] + b[1]) / 2;
        let inx = cx - midX, inz = cz - midZ;
        const inL = Math.sqrt(inx * inx + inz * inz);
        inx /= inL; inz /= inL;
        const numTrees = Math.floor(L / TREE_SPACING);
        for (let t = 1; t <= numTrees; t++) {
          const s = (t * L) / (numTrees + 1);
          const tx = a[0] + ux * s + inx * TREE_INSET;
          const tz = a[1] + uz * s + inz * TREE_INSET;
          if (isOnRoad(tx, tz, roadSegs)) continue;
          if (isInsideAnyBuilding(tx, tz, buildingBoxes)) continue;
          treePositions.push([tx, tz]);
        }
      }
    }
  }

  const group = new THREE.Group();

  // Sidewalk mesh
  if (sidewalkVerts.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(sidewalkVerts, 3));
    geo.setIndex(sidewalkIdx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xb8b2a6,        // warm concrete grey
      roughness: 0.92,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 0;
    group.add(mesh);
  }

  // Street trees — InstancedMesh for trunk + canopy
  if (treePositions.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 3.2, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.95 });
    const canopyGeo = new THREE.SphereGeometry(2.0, 9, 7);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.85, flatShading: true });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treePositions.length);
    trunks.castShadow = true;
    canopies.castShadow = true;

    const m = new THREE.Matrix4();
    for (let i = 0; i < treePositions.length; i++) {
      const [x, z] = treePositions[i];
      // Tiny per-tree variation
      const h = 3.0 + (((i * 13) % 7) / 7) * 0.8;
      const cr = 1.7 + (((i * 7) % 11) / 11) * 0.7;

      m.makeTranslation(x, h / 2, z);
      trunks.setMatrixAt(i, m);

      m.makeScale(cr / 2.0, cr / 2.0, cr / 2.0);
      m.setPosition(x, h + cr * 0.45, z);
      canopies.setMatrixAt(i, m);
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    group.add(trunks);
    group.add(canopies);
  }

  return group;
}
