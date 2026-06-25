import type { FeatureCollection } from 'geojson';
import { BBOX } from './project.js';

const CACHE_KEY = 'midtown-osm-cache';
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
  return `[out:json][timeout:30];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
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
      const response = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

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
