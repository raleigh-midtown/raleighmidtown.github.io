import type { FeatureCollection } from 'geojson';

// Browser data loader. The scene's GeoJSON is a build-time artifact produced by
// scripts/fetch-osm.ts and served as a static file. This module never calls
// Overpass — it loads the bundled file cache-first via localStorage.

const CACHE_KEY = 'midtown-osm-cache-v2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DATA_URL = '/data/midtown.geojson';

interface CacheEntry {
  data: FeatureCollection;
  timestamp: number;
}

function showLoading(text?: string): void {
  const overlay = document.getElementById('loading-overlay');
  const textEl = document.getElementById('loading-text');
  if (overlay) overlay.classList.remove('hidden');
  if (textEl && text) textEl.textContent = text;
}

function hideLoading(): void {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function showError(message: string): void {
  const overlay = document.getElementById('error-overlay');
  const msgEl = document.getElementById('error-message');
  if (overlay) overlay.classList.remove('hidden');
  if (msgEl) msgEl.textContent = message;
}

function readCache(): FeatureCollection | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(data: FeatureCollection): void {
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch (e) {
    // QuotaExceededError or other storage errors — silently ignore
    console.warn('OSM cache write failed:', e);
  }
}

/**
 * Fetch the scene's GeoJSON FeatureCollection.
 * - Returns fresh localStorage cache (7-day TTL) when present
 * - Otherwise fetches the bundled /data/midtown.geojson and caches it
 * - On fetch failure: shows an error overlay prompting `npm run fetch-osm` and rethrows
 */
export async function fetchBuildings(): Promise<FeatureCollection> {
  showLoading('Loading Midtown Raleigh…');

  const cached = readCache();
  if (cached) {
    hideLoading();
    return cached;
  }

  showLoading('Loading map data…');
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`Failed to load map data: HTTP ${response.status}`);
    }
    const geojson = (await response.json()) as FeatureCollection;
    writeCache(geojson);
    hideLoading();
    return geojson;
  } catch (err) {
    hideLoading();
    showError('Failed to load map data. Run npm run fetch-osm and refresh.');
    throw err;
  }
}