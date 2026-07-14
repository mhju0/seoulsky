import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { appendForecasts, createFileReliabilityStore, readForecasts } from "./persistence.ts";

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

test("file persistence refuses to replace learned weights with an older checkpoint", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seoulsky-reliability-"));
  const store = createFileReliabilityStore(dir);
  const current = {
    updatedAt: "2026-07-10T00:00:00.000Z",
    eventsScored: 51,
    processedDates: ["2026-07-09", "2026-07-10"],
    weights: { "open-meteo": 0.6, kma: 0.4 },
  };
  const regressed = {
    updatedAt: "2026-06-25T00:00:00.000Z",
    eventsScored: 15,
    processedDates: ["2026-07-09"],
    weights: { "open-meteo": 0.5, kma: 0.5 },
  };

  try {
    await store.writeWeights(current);
    await assert.rejects(() => store.writeWeights(regressed), /weight state/i);
    assert.deepEqual(await store.readWeights(), current);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("batch persistence fails closed on an existing malformed weight checkpoint", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seoulsky-reliability-"));
  const store = createFileReliabilityStore(dir);
  writeFileSync(path.join(dir, "source-weights.json"), "{ malformed", "utf8");
  try {
    await assert.rejects(() => store.readWeights(), /invalid reliability weight state/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
