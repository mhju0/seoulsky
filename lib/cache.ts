/**
 * In-memory TTL cache, shared across requests in the Node.js server process.
 * If a refresh fails and a stale entry exists, the stale value is served
 * (flagged) instead of throwing — providers degrade gracefully.
 */

interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export interface CachedResult<T> {
  value: T;
  ageMs: number;
  fromCache: boolean;
  /** true when the fetcher failed and we fell back to an expired entry */
  stale: boolean;
}

export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<CachedResult<T>> {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  if (entry && now - entry.storedAt < ttlMs) {
    return { value: entry.value, ageMs: now - entry.storedAt, fromCache: true, stale: false };
  }

  try {
    const value = await fetcher();
    store.set(key, { value, storedAt: Date.now() });
    return { value, ageMs: 0, fromCache: false, stale: false };
  } catch (err) {
    if (entry) {
      return { value: entry.value, ageMs: now - entry.storedAt, fromCache: true, stale: true };
    }
    throw err;
  }
}

/** Drop one entry, or the whole cache. Used by tests to isolate cases. */
export function clearCache(key?: string): void {
  if (key === undefined) store.clear();
  else store.delete(key);
}

export function cacheEntries(): { key: string; ageSeconds: number }[] {
  const now = Date.now();
  return [...store.entries()].map(([key, entry]) => ({
    key,
    ageSeconds: Math.round((now - entry.storedAt) / 1000),
  }));
}
