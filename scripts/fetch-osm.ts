// Build-time OSM fetcher. Ensures public/data/midtown.geojson exists, downloading
// from Overpass only when the file is missing. Run via `npm run fetch-osm`
// (auto-invoked before `dev` and `build` through the predev/prebuild hooks).
//
// Browser code never calls Overpass — it loads the bundled /data/midtown.geojson
// this script produces (cache-first via localStorage). See src/osm/fetch.ts.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FeatureCollection } from 'geojson';
import { buildOverpassQuery } from '../src/osm/overpassQuery.js';

const OUTFILE = resolve(process.cwd(), 'public/data/midtown.geojson');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const RETRY_DELAYS = [1000, 2000, 4000];

export type FetchResult = 'skipped' | 'written';

export interface FetchDeps {
  existsSync: (path: string) => boolean;
  writeFile: (path: string, data: string) => void;
  fetchOverpass: (query: string) => Promise<FeatureCollection>;
}

// Default converter: Overpass JSON -> GeoJSON via osmtogeojson. Lazy-imported so
// the module loads without pulling osmtogeojson into tests that inject their own.
async function defaultConvert(osmData: unknown): Promise<FeatureCollection> {
  const osmtogeojson = (await import('osmtogeojson')).default;
  return osmtogeojson(osmData) as FeatureCollection;
}

// Fetch + convert + empty-result guard. `convert` is injectable so the empty-guard
// is testable without osmtogeojson or network.
export async function fetchOverpassData(
  query: string,
  convert: (osmData: unknown) => Promise<FeatureCollection> = defaultConvert
): Promise<FeatureCollection> {
  const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`;
  // Use GET — Overpass rejects POST with 406 in some configurations
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
  const osmData = await response.json();
  const geojson = await convert(osmData);
  if (!geojson.features || geojson.features.length === 0) {
    throw new Error('Overpass returned 0 features');
  }
  return geojson;
}

const defaultDeps: FetchDeps = {
  existsSync,
  writeFile: (p, data) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
  },
  fetchOverpass: (query) => fetchOverpassData(query),
};

/**
 * Ensure the GeoJSON file exists. Returns 'skipped' when already present,
 * 'written' when freshly generated. Throws when Overpass is exhausted and the
 * file is missing — a build should fail loudly rather than ship an empty scene.
 */
export async function fetchOsm(
  outFile: string = OUTFILE,
  deps: FetchDeps = defaultDeps
): Promise<FetchResult> {
  if (deps.existsSync(outFile)) {
    console.log('midtown.geojson present, skipping fetch');
    return 'skipped';
  }

  console.log('midtown.geojson missing, fetching from Overpass...');
  const query = buildOverpassQuery();
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      console.log(`Retrying… (attempt ${attempt + 1})`);
      await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
    }
    try {
      const geojson = await deps.fetchOverpass(query);
      deps.writeFile(outFile, JSON.stringify(geojson));
      console.log(`Wrote ${geojson.features.length} features to ${outFile}`);
      return 'written';
    } catch (err) {
      lastError = err;
      console.warn(`Overpass attempt ${attempt + 1} failed:`, err);
    }
  }

  throw new Error(`All Overpass retries exhausted: ${String(lastError)}`);
}

async function main(): Promise<void> {
  try {
    await fetchOsm();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

// Run only when invoked directly (`tsx scripts/fetch-osm.ts`), not when imported.
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) void main();