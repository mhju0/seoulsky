import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAtmosphericFieldAdapter } from "./webglFallback.ts";

test("selectAtmosphericFieldAdapter uses WebGL only while it is supported and healthy", () => {
  assert.equal(
    selectAtmosphericFieldAdapter({ webglSupported: true, webglFailed: false }),
    "webgl",
  );
  assert.equal(
    selectAtmosphericFieldAdapter({ webglSupported: false, webglFailed: false }),
    "css",
  );
  assert.equal(
    selectAtmosphericFieldAdapter({ webglSupported: true, webglFailed: true }),
    "css",
  );
  assert.equal(
    selectAtmosphericFieldAdapter({ webglSupported: false, webglFailed: true }),
    "css",
  );
});
