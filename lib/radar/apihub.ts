import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cachedFetch } from "../cache.ts";
import { cropToSeoul, CROP_W, encodePng } from "./grid.ts";
import { buildGeo, type GeoModel, reproject } from "./geo.ts";

/**
 * SERVER-ONLY data layer for the high-resolution KMA radar (apihub.kma.go.kr).
 * The API key and the ~13 MB raw reflectivity grid NEVER reach the client — route
 * handlers call {@link renderFrame} and stream only the small echo PNG.
 *
 *   • nph-rdr_cmp1_api  — one reflectivity frame (HSR, disp=B) for a given KST `tm`
 *   • nph-rdr_latlon_api — the per-cell lon/lat grids (fetched ONCE, cached to disk)
 *
 * SSRF: the host + path are constant and server-constructed; the only variable in a
 * frame request is `tm` (a 12-digit key validated upstream). The key is read from
 * `process.env.KMA_APIHUB_KEY` and is never logged or echoed in an error.
 */

const BASE = "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/";
const GEO_FILE = "geo-HSR.json";
/** A produced frame's PNG is immutable; keep rendered bytes in-process for a long while. */
const PNG_TTL_MS = 6 * 60 * 60 * 1000;

function apiKey(): string {
  const v = process.env.KMA_APIHUB_KEY?.trim();
  if (!v) throw new Error("KMA_APIHUB_KEY not configured");
  return v;
}

/** Cheap presence check (no network) so the timeline can degrade before any fetch. */
export function hasApiKey(): boolean {
  return !!process.env.KMA_APIHUB_KEY?.trim();
}

function radarDataDir(): string {
  return process.env.RADAR_DATA_DIR?.trim() || path.join(process.cwd(), "data", "radar");
}

async function fetchLatLon(which: "lon" | "lat"): Promise<string> {
  const url = `${BASE}nph-rdr_latlon_api?${new URLSearchParams({
    cmp: "HSR",
    latlon: which,
    authKey: apiKey(),
  })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`KMA latlon HTTP ${res.status}`);
  const text = await res.text();
  // Expect the `  nx,  ny,=` header; reject an error/HTML body before parsing 70 MB.
  if (!/^\s*\d+\s*,\s*\d+\s*,/.test(text)) throw new Error("KMA latlon: unexpected payload");
  return text;
}

let geoMemo: Promise<GeoModel> | null = null;

async function buildOrReadGeo(): Promise<GeoModel> {
  const file = path.join(radarDataDir(), GEO_FILE);
  try {
    const cached = JSON.parse(await readFile(file, "utf8")) as GeoModel;
    if (cached?.inv && cached?.bbox && cached.crop?.w === CROP_W) return cached;
  } catch {
    // Not cached yet (or unreadable) → build it from the latlon API once.
  }
  const [lonText, latText] = await Promise.all([fetchLatLon("lon"), fetchLatLon("lat")]);
  const geo = buildGeo(lonText, latText);
  try {
    await mkdir(radarDataDir(), { recursive: true });
    await writeFile(file, JSON.stringify(geo, null, 2), "utf8");
  } catch {
    // Disk cache is an optimisation; the in-memory model is enough to serve.
  }
  return geo;
}

/** The georeferencing model (memoised in-process, disk-cached). Built once. */
export async function loadGeo(): Promise<GeoModel> {
  if (!geoMemo) {
    geoMemo = buildOrReadGeo().catch((err) => {
      geoMemo = null; // allow a later retry (e.g. transient latlon fetch failure)
      throw err;
    });
  }
  return geoMemo;
}

/** Lat/lon extent of the rendered echo raster — the client georeferences the PNG to this. */
export async function frameBounds(): Promise<GeoModel["bbox"]> {
  return (await loadGeo()).bbox;
}

async function fetchFrameGrid(tm: string): Promise<ArrayBuffer> {
  const url = `${BASE}nph-rdr_cmp1_api?${new URLSearchParams({
    tm,
    cmp: "HSR",
    qcd: "MSK",
    obs: "ECHO",
    map: "HB",
    disp: "B",
    authKey: apiKey(),
  })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`KMA radar HTTP ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Render one frame's Seoul echo to a Mercator-aligned PNG (transparent where no echo).
 * Cached by `tm` (immutable). Throws if the key is missing, the frame isn't published
 * yet, or the grid is malformed — callers degrade to an honest empty state.
 */
export async function renderFrame(tm: string): Promise<Buffer> {
  const result = await cachedFetch(`radar-png-${tm}`, PNG_TTL_MS, async () => {
    const [buf, geo] = await Promise.all([fetchFrameGrid(tm), loadGeo()]);
    const crop = cropToSeoul(buf); // validates disp=B header + length
    const { rgba, width, height } = reproject(crop, geo);
    return encodePng(rgba, width, height);
  });
  return result.value;
}
