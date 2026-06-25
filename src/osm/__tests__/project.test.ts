// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { projectLonLat, BBOX } from '../project.js';

const CENTER_LON = (BBOX.west + BBOX.east) / 2;   // -78.6825
const CENTER_LAT = (BBOX.south + BBOX.north) / 2; // 35.7975

describe('projectLonLat', () => {
  it('projecting bounding box center returns {x≈0, z≈0}', () => {
    const [x, z] = projectLonLat(CENTER_LON, CENTER_LAT);
    expect(Math.abs(x)).toBeLessThan(0.1);
    expect(Math.abs(z)).toBeLessThan(0.1);
  });

  it('a point 100m north returns z≈-100', () => {
    // 1 degree of latitude ≈ 111,139 m; 100m ≈ 0.0008998°
    const deltaLat = 100 / 111139;
    const [, z] = projectLonLat(CENTER_LON, CENTER_LAT + deltaLat);
    // z should be approximately -100 (north is negative z in Three.js)
    expect(z).toBeCloseTo(-100, -1); // within ~10m
  });

  it('a point east of center has positive x', () => {
    const [x] = projectLonLat(CENTER_LON + 0.001, CENTER_LAT);
    expect(x).toBeGreaterThan(0);
  });

  it('a point west of center has negative x', () => {
    const [x] = projectLonLat(CENTER_LON - 0.001, CENTER_LAT);
    expect(x).toBeLessThan(0);
  });
});
