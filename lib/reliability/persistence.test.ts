import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { appendForecasts, readForecasts } from "./persistence.ts";

test("reliability persistence keeps forecast writes idempotent", async () => {
  const previous = process.env.RELIABILITY_DATA_DIR;
  const dir = mkdtempSync(path.join(tmpdir(), "seoulsky-reliability-"));
  process.env.RELIABILITY_DATA_DIR = dir;
  const record = {
    date: "2026-07-15",
    source: "open-meteo" as const,
    region: "seoul",
    pop: 30,
    predicted_mm: 1.2,
    loggedAt: "2026-07-14T00:00:00.000Z",
  };
  try {
    assert.equal(await appendForecasts([record]), 1);
    assert.equal(await appendForecasts([record]), 0);
    assert.deepEqual(await readForecasts(record.date), [record]);
  } finally {
    process.env.RELIABILITY_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
