// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { fetchOsm, fetchOverpassData } from '../fetch-osm.js';

function makeGeoJSON(n = 3): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: n }, (_, i) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: [i, i] },
    })),
  };
}

describe('fetchOsm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips when the file already exists (no network, no write)', async () => {
    const existsSync = vi.fn(() => true);
    const writeFile = vi.fn();
    const fetchOverpass = vi.fn();

    const result = await fetchOsm('/out.geojson', { existsSync, writeFile, fetchOverpass });

    expect(result).toBe('skipped');
    expect(fetchOverpass).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('downloads and writes the file when it is missing', async () => {
    const data = makeGeoJSON(5);
    const existsSync = vi.fn(() => false);
    const writeFile = vi.fn();
    const fetchOverpass = vi.fn(async () => data);

    const result = await fetchOsm('/out.geojson', { existsSync, writeFile, fetchOverpass });

    expect(result).toBe('written');
    expect(fetchOverpass).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith('/out.geojson', JSON.stringify(data));
  });

  it('retries on failure and succeeds on the second attempt', async () => {
    const data = makeGeoJSON(2);
    let calls = 0;
    const fetchOverpass = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error('timeout');
      return data;
    });

    const p = fetchOsm('/out.geojson', {
      existsSync: () => false,
      writeFile: vi.fn(),
      fetchOverpass,
    });
    await vi.runAllTimersAsync();
    const result = await p;

    expect(result).toBe('written');
    expect(fetchOverpass).toHaveBeenCalledTimes(2);
  });

  it('throws (and does not write) when all attempts fail', async () => {
    const existsSync = vi.fn(() => false);
    const writeFile = vi.fn();
    const fetchOverpass = vi.fn(async () => {
      throw new Error('network down');
    });

    const p = fetchOsm('/out.geojson', { existsSync, writeFile, fetchOverpass });
    // Attach the rejection handler before flushing timers so the reject doesn't
    // surface as an unhandled rejection while the retry delays are being drained.
    const assertion = expect(p).rejects.toThrow(/All Overpass retries exhausted/);
    await vi.runAllTimersAsync();
    await assertion;
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('fetchOverpassData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects on a non-OK Overpass response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', { status: 504 })
    );
    await expect(fetchOverpassData('q', async () => makeGeoJSON(1))).rejects.toThrow(
      /Overpass HTTP 504/
    );
  });

  it('rejects when conversion yields 0 features (empty-result guard)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ elements: [] }), { status: 200 })
    );
    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
    await expect(
      fetchOverpassData('q', async () => empty)
    ).rejects.toThrow(/Overpass returned 0 features/);
  });

  it('returns the converted collection when features are present', async () => {
    const data = makeGeoJSON(4);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ elements: [] }), { status: 200 })
    );
    const result = await fetchOverpassData('q', async () => data);
    expect(result.features).toHaveLength(4);
  });
});