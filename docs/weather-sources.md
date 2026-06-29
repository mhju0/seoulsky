# 날씨·환경 데이터 소스 (Weather & Environment Sources)

SeoulSky가 사용하는 모든 데이터 소스의 **목적 · 인증 · 신선도/캐시 · 폴백 · 약관/출처 표기 · 우선순위 · 구현 여부**를 한곳에 정리한 문서입니다. 좌표는 항상 서울 고정(37.5665°N, 126.9780°E), 시간대는 `Asia/Seoul`.

핵심 원칙:

- **키 0개로 완전 동작**합니다. 키 없는 기반은 Open-Meteo(기상) + Open-Meteo 대기질 + RainViewer 레이더.
- 모든 외부 호출은 **서버 사이드**에서만 일어납니다. 키·연락처는 브라우저로 전송되지 않습니다.
- 데이터는 **위조·스크래핑하지 않습니다.** 미설정·실패 시 해당 소스는 조용히 빠지고, 씬은 남은 소스로 계속 동작합니다.
- 캐시는 인메모리 TTL + **stale-while-revalidate**: 업스트림이 실패하면 만료된 항목을 `stale` 플래그와 함께 제공해 화면이 비지 않게 합니다(데이터가 오래됐음은 표시).

---

## 요약 표

| 소스 | 목적 | 키/인증 | TTL | 우선순위 | 구현 |
| --- | --- | --- | --- | --- | --- |
| Open-Meteo Forecast | 기상 기반 (현재/시간별/주간, 일출·일몰) | 불필요 | 5분 | 기상 기반·항상 | ✅ |
| Open-Meteo Air Quality | 대기질 기반 (PM·O₃·NO₂·먼지·AOD·UV) | 불필요 | 20분 | 대기질 2순위 | ✅ |
| RainViewer | 강수 레이더 (서울 부근·접근) | 불필요 | 10분 | 레이더·유일 | ✅ |
| MET Norway Locationforecast | `/diagnostics` 비교용 기상 | User-Agent(연락처) | 15분 | 비교 전용 | ✅ |
| 기상청 KMA 단기예보 | 공식 초단기실황·단기예보 | `KMA_SHORT_TERM_API_KEY` | 5분 | 현재 관측 1순위 | ✅ |
| 기상청 KMA 기상특보 | 공식 기상특보 | `KMA_WARNING_API_KEY` | 5분 | 특보 유일 | ✅ (서비스별 독립 키·독립 검증) |
| AirKorea | 공식 측정소 대기질 | `AIRKOREA_API_KEY` | 20분 | 대기질 1순위 | ✅ (미구독 키로 라이브 미검증) |

---

## 1. Open-Meteo Forecast — 기상 기반

- **목적**: 공개 씬과 `/diagnostics` 양쪽의 기상 기반. 현재값 + 시간별 + 주간 + 오늘 일출/일몰.
- **엔드포인트**: `https://api.open-meteo.com/v1/forecast`
- **인증**: 없음. 무료, 키 불필요.
- **신선도/캐시**: `CACHE_TTL_MS` = 5분 (`lib/seoul.ts`). 캐시 키 `open-meteo`.
- **폴백**: 실패 시 `stale` 캐시 제공. 캐시도 없으면 해당 스냅샷은 `error`로 표기되고 씬은 마지막 성공 스냅샷 유지.
- **약관/출처**: 비상업 무료 사용. 출처 표기는 권장(푸터에 "데이터: Open-Meteo").
- **구현**: `lib/providers/open-meteo.ts`. 씬 전용 가벼운 변형은 `/api/sky`가 동일 프로바이더(+캐시)를 재사용.

## 2. Open-Meteo Air Quality — 대기질 기반

- **목적**: 키 없는 대기질 기반. PM2.5/PM10/오존/NO₂, 그리고 Open-Meteo 고유의 **먼지(dust)·AOD·UV** — 씬의 연무/가시성/노출에 절제되게 반영.
- **엔드포인트**: `https://air-quality-api.open-meteo.com/v1/air-quality`
- **인증**: 없음.
- **신선도/캐시**: `AQ_TTL_MS` = 20분 (`lib/providers/air-quality.ts`). 대기질은 대략 시간 단위로 갱신.
- **폴백**: AirKorea가 가용하면 그쪽이 우선. 둘 다 실패면 `air = null` → 씬은 대기질 영향 없이 동작.
- **약관/출처**: Open-Meteo와 동일.
- **구현**: `lib/providers/air-quality.ts`의 `fetchOpenMeteoAq()`. 정규화·밴드 환산은 `lib/airQuality.ts`.

## 3. RainViewer — 강수 레이더

> **갱신(2026-06):** `/sky`에 *표시되는* 강수 레이더 **이미지**는 이제 기상청 apihub의 **HSR 500m 반사도 격자**를 서버에서 렌더링합니다(`KMA_APIHUB_KEY`, `lib/radar/*`). RainViewer는 **접근 신호(approach signal) 전용**으로 남아 헤드라인 카피에만 쓰입니다 — 아래 설명은 그 접근-신호 역할 기준입니다. 표시 이미지 파이프라인은 `CLAUDE.md`의 *Radar imagery* 참조.

- **목적**: 서울 부근 강수 유무와 **보수적 접근 방향**(서/북서/남서)을 추려 카메라·카피에 살짝 반영. 접근 신호는 프레임이 뒷받침할 때만 표기 — 절대 지어내지 않음.
- **엔드포인트**: `https://api.rainviewer.com/public/weather-maps.json` (프레임 목록 + 타일 호스트). 타일은 8-bit RGBA PNG.
- **인증**: 없음.
- **신선도/캐시**: `RADAR_TTL_MS` = 10분 (`lib/providers/radar.ts`). 관측 프레임은 통상 10분 간격.
- **폴백**: 실패 시 `radar = null`. 씬은 레이더 영향 없이 동작.
- **약관/출처**: **출처 표기 필수** — 레이더 이미지를 표시하는 모든 화면에 "RainViewer" 크레딧을 보여야 함. `RadarSummary.attribution`에 담아 `/diagnostics` 패널에 노출(© RainViewer). 비상업 사용 한정.
- **구현**: `lib/providers/radar.ts` (PNG zlib 디코딩 + paeth 언필터, 서울 타일 추출, `analyzeApproach` W→E 보수적 분석). 진단/디버그 라우트 `app/api/weather/radar/route.ts`.

## 4. MET Norway Locationforecast — 비교 전용

- **목적**: `/diagnostics`의 교차검증·신뢰도 분석에 제2 기상 소스로 참여. **공개 씬에는 노출되지 않음.**
- **엔드포인트**: `https://api.met.no/weatherapi/locationforecast/2.0/complete`
- **인증**: API 키는 없지만 MET 약관상 **연락처가 포함된 식별 User-Agent가 필수**. `MET_NO_USER_AGENT`(예: `SeoulSky/1.0 you@example.com`). 미설정 시 `needs-config`로 표시하고 **호출하지 않음**(약관 위반 방지).
- **신선도/캐시**: `MET_TTL_MS` = 15분. 403/429 응답을 명시적으로 처리하고 `stale` 폴백.
- **폴백**: 실패/미설정 시 비교에서 빠짐. 단일 소스가 되면 신뢰도는 `single-source`로 강등.
- **약관/출처**: NLOD/CC-BY 4.0. 표시 시 "MET Norway" 출처 표기. 브라우저에서 직접 호출 금지(서버 전용).
- **구현**: `lib/providers/met-norway.ts`.

## 5. 기상청 (KMA) — 공식 관측·예보·특보

- **목적**: 한국 공식 기상청 데이터. 설정 시 **현재 관측의 1순위**(초단기실황 기온·강수)와 **기상특보의 유일한 출처**.
- **엔드포인트** (data.go.kr):
  - 초단기실황 `…/VilageFcstInfoService_2.0/getUltraSrtNcst`
  - 단기예보 `…/VilageFcstInfoService_2.0/getVilageFcst`
  - 기상특보 `https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList`
  - 서울 격자 `nx=60, ny=127`, 특보 지점번호 `stnId=109` (`lib/seoul.ts`).
- **인증 (서비스별 독립 키, 각각 선택)**: 두 서비스는 data.go.kr에서 **별도의 활용신청**이므로 **두 개의 독립 환경변수**를 사용합니다. 둘 다 URL-encoded/decoded 어느 형식이든 동작하며, `URLSearchParams`가 정확히 한 번만 인코딩하도록 내부에서 decoded로 정규화합니다. 키는 서버 전용 — 로그·응답·진단·에러에 절대 노출하지 않습니다.
  - `KMA_SHORT_TERM_API_KEY` → `VilageFcstInfoService_2.0` (초단기실황·단기예보) 전용. 미설정 시 KMA 관측·예보만 비활성.
  - `KMA_WARNING_API_KEY` → `WthrWrnInfoService` (기상특보) 전용. 미설정 시 특보만 비활성.
  - 한쪽 키가 없거나 실패해도 다른 쪽 기능은 정상 동작합니다(완전 독립).
- **신선도/캐시**: `CACHE_TTL_MS` = 5분. 캐시 키 `kma`, `kma-warnings`. base date/time는 발표 주기에 맞춰 계산.
- **폴백**: 단기예보 키 없거나 실패 시 현재 관측은 Open-Meteo로, 특보 키 없거나 실패 시 특보는 `[]`로 강등. 응답은 `response.json()` 전에 HTTP 상태·content-type·본문을 검사하는 키-비노출 `classifyKmaResponse()`로 분류해 인증 실패(`forbidden`)·한도 초과(`rate-limited`)·NODATA(빈 성공)·기타 오류를 구분합니다. **빈 특보 목록은 그 자체로 실패가 아니며**(발효 중인 특보 없음), 인증 실패는 오류 swallowing 없이 정직하게 보고됩니다.
- **약관/출처**: data.go.kr 공공데이터 이용 약관. 출처 표기 "기상청(KMA)". 각 서비스는 각자의 활용신청 승인이 필요하며 모두 선택 사항(Open-Meteo가 키 0개 폴백).
- **구현**: `lib/providers/kma.ts` + 순수 매핑 `lib/providers/kma-mapping.ts`(`conditionFromKma`, `tmFcToIso`, `extractWarnings`). 테스트 `lib/providers/kma-mapping.test.ts`, `lib/providers/kma.test.ts`(두-키 분리·상태·응답 분류).

## 6. AirKorea — 공식 측정소 대기질

- **목적**: 한국환경공단 공식 측정소 대기질. 설정 시 **대기질 1순위**(Open-Meteo 대기질보다 우선).
- **엔드포인트**: `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty` (측정소 `종로구`).
- **인증**: `AIRKOREA_API_KEY` (data.go.kr 일반 인증키).
- **신선도/캐시**: `AQ_TTL_MS` = 20분.
- **폴백**: 키 없거나 실패 시 Open-Meteo 대기질로 폴백.
- **약관/출처**: data.go.kr 공공데이터 이용 약관. 출처 표기 "AirKorea".
- **구현**: `lib/providers/air-quality.ts`의 `fetchAirKorea()`, 융합은 `getFusedAirQuality()`.
- **검증 상태**: ArpltnInforInqireSvc도 별도 구독이 필요 — 본 개발 키로는 라이브 미검증, 미구독 시 Open-Meteo 대기질로 폴백.

---

## 융합 규칙 (Fusion)

블라인드 평균이 아니라 **목적별 우선순위(purpose-based precedence)**로 융합합니다. 공개 씬은 `/api/sky`, 진단 비교는 `/api/weather`.

### 현재 관측 — `chooseCurrent(openMeteo, kma)` (`lib/skyFusion.ts`)

- 기온·강수량: **KMA 우선** (있을 때), 없으면 Open-Meteo.
- condition: **활성 강수가 있을 때만 KMA**를 따름. 비가 안 올 때 KMA 초단기실황은 운량을 보고하지 않아 "맑음"으로 뒤집힐 수 있으므로, 그 경우 condition은 **Open-Meteo**를 사용(화면 안정성).
- 그 외 필드(습도/바람/운량/가시성 등)는 Open-Meteo 기반 유지.
- 출처는 `observationSource`(헤드라인 기온의 출처)와 `sources[]`(기여한 모든 소스)에 기록.

### 대기질 — `getFusedAirQuality()` (`lib/providers/air-quality.ts`)

- 우선순위 **AirKorea → Open-Meteo 대기질 → 없음**.
- 한국 통합대기환경지수 밴드(`koreanAqiBand`, `lib/airQuality.ts`): PM2.5 ≤15/≤35/≤75/그 외, PM10 ≤30/≤80/≤150/그 외 → 1 좋음 / 2 보통 / 3 나쁨 / 4 매우나쁨.

### 특보 — KMA 전용

- KMA 키가 있을 때만. 예보 확률로 특보를 **위조하지 않음**. 실패 시 `[]`.

### 레이더 — RainViewer 전용

- 서울 부근 강수와 보수적 접근 방향만. 프레임 근거가 있을 때만 "접근 중".

### 진단 비교 (`/api/weather`)

- Open-Meteo와 MET Norway를 **교차검증**(`buildComparison`/`buildConfidence`). 단일 소스만 살아있으면 신뢰도 `single-source`.

---

## 시네마틱 매핑 (Cinematic Mapping)

데이터는 `lib/cinematic/weatherSceneConfig.ts`에서 수치 시각 설정으로 변환되고, `SceneDirector`가 매 프레임 라이브 설정을 타깃으로 보간합니다(React 리렌더 없음).

- **대기질 → 연무/가시성**: `aerosolFromAir(air)`가 0..1 연무값을 산출(pm25/110, pm10/180, dust/250, AOD/1.5 중 최댓값). 이를 `clarity -= aerosol*0.45`, `haze += aerosol*0.5`, `exposure -= aerosol*0.08`, `fogColor`를 황사 회색 쪽으로 믹스. 전부 **클램프**되어 절대 의학적 경고 수준으로 과장되지 않음.
- **카피의 정직성**: 시각 효과는 AOD를 쓰지만, **먼지 카피는 PM 밴드(`airBand`)에 근거**합니다(AOD가 PM보다 과대평가되어 "황사" 문구가 잘못 뜨는 것 방지). `poeticWeatherCopy.ts`.
- **레이더 → 카피/카메라**: 접근이 확인되면 "{방향}쪽의 비구름이 서울 쪽으로 천천히 다가오고 있습니다" 류의 결정적 한 줄. 모든 카피는 결정적이며 AI API를 호출하지 않습니다.
- **UV → 주간 글레어**: 낮 시간 노출에 미세한 가산.

---

## 구현 여부 정리

- ✅ **구현·라이브 검증**: Open-Meteo Forecast, Open-Meteo Air Quality, RainViewer, MET Norway, KMA 관측/단기예보, 융합(`/api/sky`), 진단(`/diagnostics`).
- 🟡 **구현·단위 테스트, 라이브 미검증**(개발 키 미구독): KMA 기상특보, AirKorea. 미구독 시 안전하게 강등됨.
- ⏭️ **미구현(향후)**: Meteostat, 원시 수치모델(ECMWF/NOAA GFS/DWD ICON) 등 — [`future-weather-sources.md`](future-weather-sources.md) 참조.
