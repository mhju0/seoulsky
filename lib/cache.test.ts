import assert from "node:assert/strict";
import test from "node:test";
import { cachedFetch, clearCache } from "./cache.ts";

test("cachedFetch shares one cold-cache request across concurrent callers", async () => {
  clearCache();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const fetcher = async () => {
    calls += 1;
    await gate;
    return { ok: true };
  };

  const first = cachedFetch("single-flight", 60_000, fetcher);
  const second = cachedFetch("single-flight", 60_000, fetcher);
  const third = cachedFetch("single-flight", 60_000, fetcher);
  assert.equal(calls, 1);

  release();
  const results = await Promise.all([first, second, third]);
  assert.equal(calls, 1);
  assert.deepEqual(results.map((result) => result.value), [
    { ok: true },
    { ok: true },
    { ok: true },
  ]);
});

test("cachedFetch serves a fresh cached value without calling the fetcher again", async () => {
  clearCache();
  let calls = 0;
  const fetcher = async () => ++calls;

  const first = await cachedFetch("fresh", 60_000, fetcher);
  const second = await cachedFetch("fresh", 60_000, fetcher);

  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(second.value, 1);
  assert.equal(calls, 1);
});
