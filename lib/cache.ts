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
const pending = new Map<string, Promise<CachedResult<unknown>>>();

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

  const inFlight = pending.get(key) as Promise<CachedResult<T>> | undefined;
  if (inFlight) return inFlight;

  const refresh = (async (): Promise<CachedResult<T>> => {
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
  })();
  pending.set(key, refresh as Promise<CachedResult<unknown>>);
  try {
    return await refresh;
  } finally {
    if (pending.get(key) === refresh) pending.delete(key);
  }
}

/** Drop one entry, or the whole cache. Used by tests to isolate cases. */
export function clearCache(key?: string): void {
  if (key === undefined) {
    store.clear();
    pending.clear();
  } else {
    store.delete(key);
    pending.delete(key);
  }
}
