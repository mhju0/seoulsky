import assert from "node:assert/strict";
import test from "node:test";
import { multiSourcePrecipEnabled } from "./config.ts";

test("learned multi-source weighting is on by default with a single explicit opt-out", () => {
  assert.equal(multiSourcePrecipEnabled(undefined), true);
  assert.equal(multiSourcePrecipEnabled(""), true);
  assert.equal(multiSourcePrecipEnabled("1"), true);
  assert.equal(multiSourcePrecipEnabled("0"), false);
});
