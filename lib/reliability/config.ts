/** Learned multi-source precipitation is production-default; "0" is the explicit emergency opt-out. */
export function multiSourcePrecipEnabled(value: string | undefined): boolean {
  return value !== "0";
}
