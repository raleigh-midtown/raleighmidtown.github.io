import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FeatureCollection } from 'geojson';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGeoJSON(n = 3): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: n }, (_, i) => ({
      type: 'Feature' as const,
      id: `f${i}`,
      properties: { building: 'yes', height: '10' },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [-78.685 + i * 0.001, 35.797],
            [-78.684 + i * 0.001, 35.797],
            [-78.684 + i * 0.001, 35.798],
            [-78.685 + i * 0.001, 35.798],
            [-78.685 + i * 0.001, 35.797],
          ],
        ],
      },
    })),
  };
}

// Mock DOM elements used by fetch.ts
function setupDOM() {
  document.body.innerHTML = `
    <div id="loading-overlay"></div>
    <p id="loading-text"></p>
    <div id="error-overlay" class="hidden"></div>
    <p id="error-message"></p>
  `;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchBuildings — cache behaviour', () => {
  beforeEach(() => {
    setupDOM();
    localStorage.clear();
    vi.useFakeTimers();
    // Reset module registry so each test gets a fresh import
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns cached GeoJSON and skips network fetch when cache is fresh', async () => {
    const cached = makeGeoJSON(2);
    localStorage.setItem(
      'midtown-osm-cache',
      JSON.stringify({ data: cached, timestamp: Date.now() })
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { fetchBuildings } = await import('../fetch.js');
    const result = await fetchBuildings();

    expect(result.features).toHaveLength(2);
    // fetch should NOT have been called at all (cache hit)
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores expired cache and calls Overpass', async () => {
    const stale = makeGeoJSON(1);
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      'midtown-osm-cache',
      JSON.stringify({ data: stale, timestamp: eightDaysAgo })
    );

    const fresh = makeGeoJSON(5);

    // Mock osmtogeojson before importing fetch
    vi.doMock('osmtogeojson', () => ({ default: () => fresh }));

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ elements: [] }), { status: 200 })
    );

    const { fetchBuildings } = await import('../fetch.js');

    const resultPromise = fetchBuildings();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.features).toHaveLength(5);
  });

  it('retries on failure and eventually loads fallback GeoJSON', async () => {
    localStorage.clear();

    const fallbackData = makeGeoJSON(3);

    vi.doMock('osmtogeojson', () => ({
      default: () => ({ type: 'FeatureCollection', features: [] as never[] }),
    }));

    // Overpass always fails; fallback URL succeeds
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      if (String(url).includes('midtown-fallback')) {
        return Promise.resolve(new Response(JSON.stringify(fallbackData), { status: 200 }));
      }
      return Promise.reject(new Error('Network error'));
    });

    const { fetchBuildings } = await import('../fetch.js');

    const resultPromise = fetchBuildings();
    // Fast-forward through all retry + error-display timers
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.features).toHaveLength(3);
  });

  it('writes fresh Overpass data to localStorage cache', async () => {
    localStorage.clear();

    const fresh = makeGeoJSON(4);
    vi.doMock('osmtogeojson', () => ({ default: () => fresh }));

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ elements: [] }), { status: 200 })
    );

    const { fetchBuildings } = await import('../fetch.js');
    const resultPromise = fetchBuildings();
    await vi.runAllTimersAsync();
    await resultPromise;

    const raw = localStorage.getItem('midtown-osm-cache');
    expect(raw).not.toBeNull();
    const entry = JSON.parse(raw!) as { data: FeatureCollection; timestamp: number };
    expect(entry.data.features).toHaveLength(4);
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  it('retry logic: makes multiple fetch attempts before giving up', async () => {
    localStorage.clear();

    const fallbackData = makeGeoJSON(2);

    vi.doMock('osmtogeojson', () => ({
      default: () => ({ type: 'FeatureCollection', features: [] as never[] }),
    }));

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      if (String(url).includes('midtown-fallback')) {
        return Promise.resolve(new Response(JSON.stringify(fallbackData), { status: 200 }));
      }
      return Promise.reject(new Error('timeout'));
    });

    const { fetchBuildings } = await import('../fetch.js');

    const resultPromise = fetchBuildings();
    await vi.runAllTimersAsync();
    await resultPromise;

    // 4 Overpass attempts (initial + 3 retries) + 1 fallback fetch
    const overpassCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('overpass-api.de')
    );
    expect(overpassCalls.length).toBe(4);
  });
});
