import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FeatureCollection, Feature, LineString, MultiLineString } from 'geojson';
import { projectLonLat } from './project.js';

const ROAD_Y = 0.10;     // above greenspace + sidewalk so road wins without z-fighting
const STRIPE_Y = 0.14;   // lane stripe slightly above road
const STRIPE_HW = 0.15;  // 30 cm wide stripe

const LANE_WIDTH = 3.5; // meters per lane

function defaultLanes(hw: string): number {
  if (['motorway', 'trunk'].includes(hw)) return 4;
  if (hw === 'primary') return 4;
  if (hw === 'secondary') return 3;
  if (['tertiary', 'residential', 'unclassified', 'living_street'].includes(hw)) return 2;
  if (['service', 'alley'].includes(hw)) return 1;
  return 2;
}

function halfWidthFor(props: Record<string, unknown>, hw: string): number {
  const lanesRaw = parseInt(String(props['lanes'] ?? ''), 10);
  const lanes = Number.isFinite(lanesRaw) && lanesRaw > 0 ? lanesRaw : defaultLanes(hw);
  return Math.max(1.5, (lanes * LANE_WIDTH) / 2);
}

type Pt = { x: number; z: number };

/** Build a mitered ribbon polyline at given Y. Returns geometry or null if degenerate. */
function mitered(pts: Pt[], halfW: number, y: number): THREE.BufferGeometry | null {
  if (pts.length < 2) return null;

  // Drop duplicates / near-duplicates
  const clean: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const last = clean[clean.length - 1];
    const dx = pts[i].x - last.x, dz = pts[i].z - last.z;
    if (dx * dx + dz * dz > 1e-4) clean.push(pts[i]);
  }
  if (clean.length < 2) return null;

  // Per-segment unit tangents and left normals
  const segs: { tx: number; tz: number; nx: number; nz: number }[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const dx = clean[i + 1].x - clean[i].x;
    const dz = clean[i + 1].z - clean[i].z;
    const L = Math.sqrt(dx * dx + dz * dz);
    const tx = dx / L, tz = dz / L;
    // Left normal (CCW from tangent in XZ): (-tz, tx)
    segs.push({ tx, tz, nx: -tz, nz: tx });
  }

  // Per-vertex miter normal (left side)
  const verts: number[] = [];
  const MAX_MITER = 3.0; // cap at 3x halfW to avoid spikes at sharp turns

  for (let i = 0; i < clean.length; i++) {
    const s0 = i > 0 ? segs[i - 1] : segs[i];
    const s1 = i < segs.length ? segs[i] : segs[segs.length - 1];

    // Bisector of left normals
    let nx = s0.nx + s1.nx;
    let nz = s0.nz + s1.nz;
    const nl = Math.sqrt(nx * nx + nz * nz);
    if (nl < 1e-6) { nx = s1.nx; nz = s1.nz; }
    else { nx /= nl; nz /= nl; }

    // miter length so projected onto seg-normal equals halfW
    const dot = nx * s1.nx + nz * s1.nz;
    let mLen = halfW / Math.max(0.3, Math.abs(dot));
    if (mLen > halfW * MAX_MITER) mLen = halfW * MAX_MITER;

    const lx = clean[i].x + nx * mLen;
    const lz = clean[i].z + nz * mLen;
    const rx = clean[i].x - nx * mLen;
    const rz = clean[i].z - nz * mLen;

    verts.push(lx, y, lz);   // left  (2*i)
    verts.push(rx, y, rz);   // right (2*i + 1)
  }

  // Triangulate: for each segment, two CCW-from-above triangles
  const idx: number[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    const a = 2 * i;       // left[i]
    const b = 2 * i + 1;   // right[i]
    const c = 2 * (i + 1); // left[i+1]
    const d = 2 * (i + 1) + 1; // right[i+1]
    // Normal up: (a, c, b) and (b, c, d)
    idx.push(a, c, b);
    idx.push(b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Build a flat road mesh group from a GeoJSON FeatureCollection containing highway ways. */
export function buildRoadsGroup(geojson: FeatureCollection): THREE.Group {
  const roadGeos: THREE.BufferGeometry[] = [];
  const stripeGeos: THREE.BufferGeometry[] = [];

  for (const feature of geojson.features as Feature[]) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const hw = String(props['highway'] ?? '').toLowerCase();
    if (!hw) continue;
    if (['footway', 'path', 'steps', 'cycleway', 'track'].includes(hw)) continue;

    const halfW = halfWidthFor(props, hw);
    const oneway = String(props['oneway'] ?? '') === 'yes';

    const processCoords = (coords: number[][]) => {
      const pts: Pt[] = coords.map(([lon, lat]) => {
        const [x, z] = projectLonLat(lon, lat);
        return { x, z };
      });
      const roadGeo = mitered(pts, halfW, ROAD_Y);
      if (roadGeo) roadGeos.push(roadGeo);

      // Center stripe: yellow for two-way (double-line look via slight offset),
      // white for oneway (skip — would be on roadway edge of paired carriageway median).
      // Use a single thin stripe down center for primary/secondary/tertiary two-way roads.
      if (!oneway && ['primary', 'secondary', 'tertiary', 'residential'].includes(hw) && halfW >= 2.5) {
        const stripeGeo = mitered(pts, STRIPE_HW, STRIPE_Y);
        if (stripeGeo) stripeGeos.push(stripeGeo);
      }
    };

    const geomType = feature.geometry?.type;
    if (geomType === 'LineString') {
      processCoords((feature.geometry as LineString).coordinates as number[][]);
    } else if (geomType === 'MultiLineString') {
      for (const coords of (feature.geometry as MultiLineString).coordinates) {
        processCoords(coords as number[][]);
      }
    }
  }

  const group = new THREE.Group();

  if (roadGeos.length > 0) {
    const merged = mergeGeometries(roadGeos, false);
    if (merged) {
      for (const g of roadGeos) g.dispose();
      const mat = new THREE.MeshBasicMaterial({ color: 0x3d3a38 });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.renderOrder = 1;
      group.add(mesh);
    }
  }

  if (stripeGeos.length > 0) {
    const merged = mergeGeometries(stripeGeos, false);
    if (merged) {
      for (const g of stripeGeos) g.dispose();
      const mat = new THREE.MeshBasicMaterial({ color: 0xf2c849 });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.renderOrder = 2;
      group.add(mesh);
    }
  }

  return group;
}
