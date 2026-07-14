import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const GLOBAL_CSS = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

function sharedSurfaceDeclarations(): string {
  const match = GLOBAL_CSS.match(
    /\.sky-panel,\s*\.sky-film-surface\s*\{([^}]*)\}/,
  );

  assert.ok(match, "Missing the shared data-surface CSS rule");
  return match[1];
}

test("all radar and confidence surfaces keep the scene transparent", () => {
  const declarations = sharedSurfaceDeclarations();

  assert.match(declarations, /background-color:\s*transparent\s*;/);
  assert.match(declarations, /background-image:\s*none\s*;/);
  assert.match(declarations, /backdrop-filter:\s*none\s*;/);
});
