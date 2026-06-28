import type { FeatureCollection } from 'geojson';
import { BBOX } from './project.js';

const CACHE_KEY = 'midtown-osm-cache-v2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FALLBACK_URL = '/data/midtown-fallback.geojson';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const RETRY_DELAYS = [1000, 2000, 4000];

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

function hideError(): void {
  const overlay = document.getElementById('error-overlay');
  if (overlay) overlay.classList.add('hidden');
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

function buildOverpassQuery(): string {
  const { south, west, north, east } = BBOX;
  return `[out:json][timeout:90];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street)$"](${south},${west},${north},${east});
  way["leisure"="park"](${south},${west},${north},${east});
  way["landuse"~"^(grass|recreation_ground|park|garden|meadow)$"](${south},${west},${north},${east});
  way["natural"~"^(wood|grassland)$"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;`;
}

function buildRoadsQuery(): string {
  const { south, west, north, east } = BBOX;
  // Only drivable + residential roads; skip footways/paths to keep payload small
  return `[out:json][timeout:25];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street)$"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;`;
}

async function fetchFromOverpass(): Promise<FeatureCollection> {
  const osmtogeojson = (await import('osmtogeojson')).default;
  const query = buildOverpassQuery();

  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      showLoading(`Retrying… (attempt ${attempt + 1})`);
      await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
    }

    try {
      // Use GET — Overpass rejects POST with 406 in some configurations
      const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`;
      const response = await fetch(url, { method: 'GET' });

      if (!response.ok) {
        throw new Error(`Overpass HTTP ${response.status}`);
      }

      const osmData = await response.json();
      const geojson = osmtogeojson(osmData);

      if (!geojson.features || geojson.features.length === 0) {
        throw new Error('Overpass returned 0 features');
      }

      writeCache(geojson);
      return geojson;
    } catch (err) {
      lastError = err;
      console.warn(`Overpass attempt ${attempt + 1} failed:`, err);
    }
  }

  throw lastError;
}

async function loadFallback(): Promise<FeatureCollection> {
  const response = await fetch(FALLBACK_URL);
  if (!response.ok) {
    throw new Error(`Failed to load fallback GeoJSON: HTTP ${response.status}`);
  }
  return response.json() as Promise<FeatureCollection>;
}

/**
 * Fetch road (highway) ways from Overpass. Returns null on any failure.
 * Non-critical — caller should render roads only when this resolves successfully.
 */
export async function fetchRoads(): Promise<FeatureCollection | null> {
  const cacheKey = 'midtown-roads-cache-v2';
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const entry = JSON.parse(raw) as CacheEntry;
      if (Date.now() - entry.timestamp <= CACHE_TTL_MS) return entry.data;
      localStorage.removeItem(cacheKey);
    }
  } catch { /* ignore */ }

  try {
    const osmtogeojson = (await import('osmtogeojson')).default;
    const url = `${OVERPASS_URL}?data=${encodeURIComponent(buildRoadsQuery())}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`Overpass roads HTTP ${res.status}`);
    const osmData = await res.json();
    const geojson = osmtogeojson(osmData);
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data: geojson, timestamp: Date.now() }));
    } catch { /* quota */ }
    return geojson;
  } catch (err) {
    console.warn('[Roads] Overpass fetch failed:', err);
    return null;
  }
}

/**
 * Fetch building footprints as a GeoJSON FeatureCollection.
 * - Checks localStorage cache first (7 day TTL)
 * - Fetches from Overpass API with 3 retries + exponential backoff
 * - On failure: shows error overlay briefly, then loads bundled fallback GeoJSON
 * - Shows/hides loading overlay throughout
 */
export async function fetchBuildings(): Promise<FeatureCollection> {
  showLoading('Loading Midtown Raleigh…');

  // Check cache
  const cached = readCache();
  if (cached) {
    hideLoading();
    return cached;
  }

  showLoading('Fetching building data…');

  try {
    const geojson = await fetchFromOverpass();
    hideLoading();
    return geojson;
  } catch (err) {
    console.error('All Overpass retries exhausted, loading fallback:', err);
    showError('Could not reach map server — loading cached local data…');
    // Show error briefly then dismiss
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    hideError();

    showLoading('Loading fallback data…');
    try {
      const fallback = await loadFallback();
      hideLoading();
      return fallback;
    } catch (fallbackErr) {
      hideLoading();
      showError('Failed to load building data. Please refresh.');
      throw fallbackErr;
    }
  }
}
