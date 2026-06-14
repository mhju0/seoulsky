"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SkySnapshot } from "@/lib/types";

/**
 * Keeps the cinematic scene's weather current from /api/sky (Open-Meteo only):
 *   • fetches once on mount
 *   • refreshes every ~12 minutes
 *   • refreshes when the tab becomes visible / regains focus *and* the data is
 *     stale (covers laptop wake without hammering the API)
 *   • de-dupes concurrent requests
 *   • keeps the last good snapshot if a refresh fails (never blanks the scene)
 */

const REFRESH_MS = 12 * 60 * 1000;
const STALE_MS = 5 * 60 * 1000;

export type WeatherStatus = "loading" | "live" | "error";

export interface LiveWeather {
  snapshot: SkySnapshot | null;
  status: WeatherStatus;
  /** Epoch ms of the last successful fetch, for the "updated" indicator. */
  lastUpdatedAt: number | null;
  refresh: () => void;
}

export function useLiveSeoulWeather(): LiveWeather {
  const [snapshot, setSnapshot] = useState<SkySnapshot | null>(null);
  const [status, setStatus] = useState<WeatherStatus>("loading");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const inFlight = useRef(false);
  const lastFetchAt = useRef(0);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/sky", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SkySnapshot;
      const t = Date.now();
      lastFetchAt.current = t;
      setSnapshot(data);
      setLastUpdatedAt(t);
      setStatus("live");
    } catch {
      // Keep whatever we last had; only surface an error if we never loaded.
      setStatus((prev) => (prev === "loading" ? "error" : prev));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    const onResume = () => {
      if (!document.hidden && Date.now() - lastFetchAt.current > STALE_MS) load();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, [load]);

  return { snapshot, status, lastUpdatedAt, refresh: load };
}
