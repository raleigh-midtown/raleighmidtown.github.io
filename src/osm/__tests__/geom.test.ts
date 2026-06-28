import { describe, it, expect } from 'vitest';
import {
  pointInRing,
  isInsideAnyBuilding,
  edgeOutwardNormal,
  edgeInwardNormal,
  polygonCentroid,
  collectBuildingBoxes,
  type Pt,
  type BBox,
} from '../util/geom';

const SQUARE: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];   // closed

describe('pointInRing', () => {
  it('returns true for a point inside the unit-ish square', () => {
    expect(pointInRing(5, 5, SQUARE)).toBe(true);
  });
  it('returns false for a point clearly outside', () => {
    expect(pointInRing(20, 20, SQUARE)).toBe(false);
  });
  it('returns false for a point on the negative side of the polygon', () => {
    expect(pointInRing(-1, 5, SQUARE)).toBe(false);
  });
});

describe('polygonCentroid', () => {
  it('returns (5, 5) for the 10×10 square (closed ring, last == first)', () => {
    const [cx, cz] = polygonCentroid(SQUARE);
    expect(cx).toBeCloseTo(5);
    expect(cz).toBeCloseTo(5);
  });
  it('returns the area-weighted centroid of a triangle', () => {
    // Triangle (0,0)-(6,0)-(3,6) — area-weighted centroid = (3, 2).
    const tri: Pt[] = [[0, 0], [6, 0], [3, 6], [0, 0]];
    const [cx, cz] = polygonCentroid(tri);
    expect(cx).toBeCloseTo(3);
    expect(cz).toBeCloseTo(2);
  });

  it('resists vertex clustering — area-weighted, not vertex-averaged', () => {
    // A unit square with five extra vertices clustered along the bottom edge.
    // True (area-weighted) centroid is (0.5, 0.5). A naive vertex average
    // would be pulled toward y=0 by the clustered vertices.
    const ring: Pt[] = [
      [0, 0], [0.2, 0], [0.4, 0], [0.6, 0], [0.8, 0],
      [1, 0], [1, 1], [0, 1], [0, 0],
    ];
    const [cx, cz] = polygonCentroid(ring);
    expect(cx).toBeCloseTo(0.5, 5);
    expect(cz).toBeCloseTo(0.5, 5);
  });
  it('returns (0, 0) for an empty/single-vertex ring', () => {
    expect(polygonCentroid([])).toEqual([0, 0]);
  });
});

describe('edgeOutwardNormal / edgeInwardNormal', () => {
  // Horizontal edge from (0,0) to (10,0), centroid at (5, 5) — inward is +Z, outward is -Z.
  it('outward normal for horizontal bottom edge points away from centroid', () => {
    const [nx, nz] = edgeOutwardNormal(0, 0, 10, 0, 5, 5);
    expect(nx).toBeCloseTo(0);
    expect(nz).toBeCloseTo(-1);
  });
  it('inward normal for the same edge points toward centroid', () => {
    const [nx, nz] = edgeInwardNormal(0, 0, 10, 0, 5, 5);
    expect(nx).toBeCloseTo(0);
    expect(nz).toBeCloseTo(1);
  });
  it('outward normal for vertical right edge points away from centroid', () => {
    // (10,0)→(10,10) — outward is +X
    const [nx, nz] = edgeOutwardNormal(10, 0, 10, 10, 5, 5);
    expect(nx).toBeCloseTo(1);
    expect(nz).toBeCloseTo(0);
  });
  it('returns (0,0) for a degenerate zero-length edge', () => {
    expect(edgeOutwardNormal(5, 5, 5, 5, 0, 0)).toEqual([0, 0]);
  });
});

describe('isInsideAnyBuilding', () => {
  const buildingBox: BBox = {
    minX: 0, maxX: 10, minZ: 0, maxZ: 10, ring: SQUARE,
  };

  it('returns true when point is inside the polygon and inside its bbox', () => {
    expect(isInsideAnyBuilding(5, 5, [buildingBox])).toBe(true);
  });
  it('returns false when point is outside the bbox (prefilter wins)', () => {
    expect(isInsideAnyBuilding(50, 50, [buildingBox])).toBe(false);
  });
  it('returns false with an empty boxes array', () => {
    expect(isInsideAnyBuilding(5, 5, [])).toBe(false);
  });
});

describe('collectBuildingBoxes', () => {
  it('skips features without building=*', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { highway: 'residential' },
          geometry: { type: 'LineString' as const, coordinates: [[-78.64, 35.83], [-78.63, 35.84]] },
        },
      ],
    };
    expect(collectBuildingBoxes(fc)).toEqual([]);
  });

  it('skips building=roof features', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { building: 'roof' },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[-78.64, 35.83], [-78.639, 35.83], [-78.639, 35.831], [-78.64, 35.831], [-78.64, 35.83]]],
          },
        },
      ],
    };
    expect(collectBuildingBoxes(fc)).toEqual([]);
  });

  it('emits one bbox per building polygon with sensible min/max', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { building: 'apartments' },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[-78.640, 35.838], [-78.639, 35.838], [-78.639, 35.839], [-78.640, 35.839], [-78.640, 35.838]]],
          },
        },
      ],
    };
    const boxes = collectBuildingBoxes(fc);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].minX).toBeLessThan(boxes[0].maxX);
    expect(boxes[0].minZ).toBeLessThan(boxes[0].maxZ);
    expect(boxes[0].ring).toHaveLength(5);   // 4 vertices + closing repeat
  });
});
