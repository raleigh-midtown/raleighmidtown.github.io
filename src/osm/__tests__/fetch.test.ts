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

describe('fetchBuildings — cache + bundled file', () => {
  beforeEach(() => {
    setupDOM();
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns cached GeoJSON and skips fetch when cache is fresh', async () => {
    const cached = makeGeoJSON(2);
    localStorage.setItem(
      'midtown-osm-cache-v2',
      JSON.stringify({ data: cached, timestamp: Date.now() })
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { fetchBuildings } = await import('../fetch.js');
    const result = await fetchBuildings();

    expect(result.features).toHaveLength(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches bundled /data/midtown.geojson on cache miss and writes the cache', async () => {
    const data = makeGeoJSON(5);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(data), { status: 200 })
    );

    const { fetchBuildings } = await import('../fetch.js');
    const result = await fetchBuildings();

    expect(result.features).toHaveLength(5);
    expect(fetchSpy).toHaveBeenCalledWith('/data/midtown.geojson');

    const raw = localStorage.getItem('midtown-osm-cache-v2');
    expect(raw).not.toBeNull();
    const entry = JSON.parse(raw!) as { data: FeatureCollection; timestamp: number };
    expect(entry.data.features).toHaveLength(5);
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  it('ignores expired cache and fetches the bundled file', async () => {
    const stale = makeGeoJSON(1);
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      'midtown-osm-cache-v2',
      JSON.stringify({ data: stale, timestamp: eightDaysAgo })
    );

    const fresh = makeGeoJSON(4);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(fresh), { status: 200 })
    );

    const { fetchBuildings } = await import('../fetch.js');
    const result = await fetchBuildings();

    expect(result.features).toHaveLength(4);
    expect(fetchSpy).toHaveBeenCalledWith('/data/midtown.geojson');
  });

  it('shows the error overlay and rejects when the bundled fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 404 }));

    const { fetchBuildings } = await import('../fetch.js');
    await expect(fetchBuildings()).rejects.toThrow();

    const overlay = document.getElementById('error-overlay');
    expect(overlay?.classList.contains('hidden')).toBe(false);
  });

  it('never calls the Overpass URL', async () => {
    const data = makeGeoJSON(1);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(data), { status: 200 })
    );

    const { fetchBuildings } = await import('../fetch.js');
    await fetchBuildings();

    const urls = fetchSpy.mock.calls.map(([u]) => String(u));
    expect(urls.every((u) => !u.includes('overpass-api.de'))).toBe(true);
  });
});