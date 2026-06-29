import { describe, it, expect } from 'vitest';
import { buildOverpassQuery, buildRoadsQuery } from '../overpassQuery.js';
import { BBOX } from '../project.js';

describe('buildOverpassQuery', () => {
  const q = buildOverpassQuery();

  it('starts with the Overpass out:json header and timeout', () => {
    expect(q.startsWith('[out:json][timeout:90];')).toBe(true);
  });

  it('interpolates the live BBOX edges (not a hardcoded copy)', () => {
    expect(q).toContain(`${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`);
  });

  it('includes each required feature tag', () => {
    expect(q).toContain('["building"]');
    expect(q).toContain('["highway"~');
    expect(q).toContain('["leisure"="park"]');
    expect(q).toContain('["landuse"~');
    expect(q).toContain('["natural"~');
  });

  it('ends with the out body / skel qt trailers', () => {
    expect(q).toContain('out body;');
    expect(q).toContain('out skel qt;');
  });
});

describe('buildRoadsQuery', () => {
  const q = buildRoadsQuery();

  it('is highway-only (no building/leisure/landuse/natural clauses)', () => {
    expect(q).toContain('["highway"~');
    expect(q).not.toContain('["building"]');
    expect(q).not.toContain('["leisure"="park"]');
    expect(q).not.toContain('["landuse"~');
    expect(q).not.toContain('["natural"~');
  });

  it('uses the live BBOX edges', () => {
    expect(q).toContain(`${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`);
  });
});