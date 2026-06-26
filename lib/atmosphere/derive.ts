/**
 * Small, pure derivations of secondary readouts from primary observations.
 *
 * These are STANDARD meteorological computations, not invented data: the dew
 * point follows directly from temperature + relative humidity. Every function
 * returns `null` when an input is missing or out of physical range, so a derived
 * "supporting line" is omitted (never zero-filled) under the never-fabricate rule.
 */

/**
 * Dew point in °C from temperature (°C) and relative humidity (%), via the
 * Magnus-Tetens approximation (Alduchov & Eskridge coefficients). Returns null
 * for missing inputs or RH outside (0, 100].
 *
 * Tunables: the a/b coefficients are the standard Magnus constants — leave as-is
 * unless matching a specific reference table.
 */
export function dewPointC(tempC: number | null, rh: number | null): number | null {
  if (tempC == null || rh == null) return null;
  if (rh <= 0 || rh > 100) return null;
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(rh / 100) + (a * tempC) / (b + tempC);
  return (b * gamma) / (a - gamma);
}
