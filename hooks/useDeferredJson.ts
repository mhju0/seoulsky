"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DeferredJsonOptions {
  enabled: boolean;
  url: string;
  refreshIntervalMs: number;
}

/**
 * Lazily fetch a JSON resource while preserving the last successful result.
 * Consumers keep presentation and local interaction state; this hook owns only
 * the request lifecycle (visibility gate, cadence, cancellation, and errors).
 */
export function useDeferredJson<T>({ enabled, url, refreshIntervalMs }: DeferredJsonOptions) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const aliveRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as T;
      if (!aliveRef.current || controller.signal.aborted) return;
      setData(json);
      setFailed(false);
    } catch {
      if (aliveRef.current && !controller.signal.aborted) setFailed(true);
    } finally {
      if (aliveRef.current && requestRef.current === controller) setRefreshing(false);
    }
  }, [url]);

  useEffect(() => {
    if (!enabled) return;
    queueMicrotask(refresh);
    const id = setInterval(refresh, refreshIntervalMs);
    return () => clearInterval(id);
  }, [enabled, refresh, refreshIntervalMs]);

  return { data, failed, refreshing, refresh };
}
