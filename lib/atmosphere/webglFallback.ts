/**
 * The procedural atmosphere has two adapters. Capability probing chooses the
 * optimistic WebGL path; any later pipeline/context failure permanently selects
 * the CSS path for the lifetime of the experience shell.
 */
export type AtmosphericFieldAdapter = "webgl" | "css";

export function selectAtmosphericFieldAdapter({
  webglSupported,
  webglFailed,
}: {
  webglSupported: boolean;
  webglFailed: boolean;
}): AtmosphericFieldAdapter {
  return webglSupported && !webglFailed ? "webgl" : "css";
}
