import assert from "node:assert/strict";
import { test } from "node:test";
import { dewPointC } from "./derive.ts";

test("dewPointC — known reference points", () => {
  // 20°C / 50% RH ≈ 9.3°C dew point.
  const a = dewPointC(20, 50);
  assert.ok(a != null);
  assert.ok(Math.abs(a - 9.3) < 0.3, `expected ~9.3, got ${a}`);

  // At 100% RH the dew point equals the air temperature.
  const sat = dewPointC(15, 100);
  assert.ok(sat != null);
  assert.ok(Math.abs(sat - 15) < 0.01, `expected ~15, got ${sat}`);

  // Dew point is always ≤ temperature.
  const d = dewPointC(30, 40);
  assert.ok(d != null && d < 30);
});

test("dewPointC — never fabricates from missing/invalid inputs", () => {
  assert.equal(dewPointC(null, 50), null);
  assert.equal(dewPointC(20, null), null);
  assert.equal(dewPointC(20, 0), null); // RH must be > 0
  assert.equal(dewPointC(20, 120), null); // RH must be ≤ 100
});
