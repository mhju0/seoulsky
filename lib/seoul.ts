/** Fixed location: this app is Seoul-only by design. */
export const SEOUL = {
  nameKo: "서울",
  latitude: 37.5665,
  longitude: 126.978,
  timezone: "Asia/Seoul",
  /** KMA 단기예보 grid cell for central Seoul (종로구/중구) */
  kmaGrid: { nx: 60, ny: 127 },
  /** KMA 기상특보 station id (지점번호) for 서울 (used by WthrWrnInfoService). */
  kmaWarningStn: 109,
  /** AirKorea 측정소 for central Seoul (ArpltnInforInqireSvc stationName). */
  airKoreaStation: "종로구",
} as const;

/** Cache TTL for provider data — keeps us well inside free-tier limits. */
export const CACHE_TTL_MS = 5 * 60 * 1000;
