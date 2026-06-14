# SeoulSky — 서울의 하늘을 비행 중

서울 상공을 비행하는 **실시간 3D 시네마틱 날씨 경험**.
메인 화면(`/`)은 대시보드가 아니라 한 편의 영화 인트로입니다 — 어두운 구름 속에서 시작해, 구름층을 뚫고 올라가 지금 이 순간 서울의 하늘을 드러냅니다. 시간·날짜·일출/일몰·날씨가 모두 **현재 서울(Asia/Seoul)** 기준으로 장면을 실시간 구동합니다.

- 좌표 고정: 서울 (37.5665°N, 126.9780°E)
- **API 키 0개**로 완전 동작 — 키 없는 기반은 Open-Meteo(기상) + Open-Meteo 대기질 + RainViewer 레이더
- 키를 넣으면 **공식 소스로 보강**: 기상청(KMA) 관측·특보, AirKorea 대기질, MET Norway 비교
- 실시간 WebGL(three.js / React Three Fiber). WebGL이 없으면 2D 폴백으로 우아하게 강등
- 선택적 외부 시네마틱 영상 플레이트 아키텍처 포함 (기본 비활성, 파일 없어도 동작)

## 화면 구성

| 경로 | 내용 |
| --- | --- |
| `/` | 풀스크린 실시간 3D 비행 씬 + 최소 오버레이 (라이브 서울 시계 · 온도 · 상태 · 시적인 한 줄 · 업데이트 시각) |
| `/diagnostics` | 데이터 덱 — 다중 소스 비교, 신뢰도 분석, 시간별/주간 예보, 캐시·시스템 진단 |

단축키: 메인에서 <kbd>D</kbd> → 데이터 덱, 데이터 덱에서 <kbd>Esc</kbd> → 메인.

## 실행 방법

요구 사항: Node.js 20 이상

```bash
npm install
npm run dev        # http://localhost:3000
```

환경 변수 없이 바로 동작합니다.

```bash
npm run build && npm start   # 프로덕션 빌드 실행
npm run lint                 # ESLint
npx tsc --noEmit             # 타입 체크
npm test                     # 단위 테스트 (KMA 카테고리·대기질·융합 매핑)
```

---

## 시스템 개요

### 1. 서울 시간 (`lib/cinematic/seoulTime.ts`)

브라우저의 로컬 타임존을 **절대 사용하지 않습니다.** 낮/밤 판정은 *절대 시각*을 비교해 이뤄지므로(일출·일몰 ISO 문자열은 `+09:00` 오프셋을 가지고, `Date.now()`는 절대 순간) 사용자가 어디에 있든 결과가 동일합니다. 표시용 포맷만 `Intl.DateTimeFormat(..., { timeZone: "Asia/Seoul" })`로 처리합니다.

핵심은 **연속적인 태양 위상**입니다. 오늘의 일출·일몰과 현재 시각으로 `elevation`(−1 자정 · 0 지평선 · +1 정오) 프록시를 계산하고, 여기서 `dayFactor`, `twilightFactor`(지평선 근처 따뜻한 띠), `goldenFactor`, `rising`(새벽/황혼 구분)을 도출합니다. 10단계 위상(deep-night → pre-dawn → sunrise → … → blue-hour)은 카피·미세 조정에만 쓰고, 색은 위상 이름이 아니라 `elevation`을 따라 **부드럽게 보간**됩니다. 일출/일몰 데이터가 없으면 서울 평균치로 강등 추정합니다.

### 2. 일출/일몰이 장면을 구동하는 방식

`elevation`이 모든 시간대 시각값을 좌우합니다 — 하늘 그라디언트(top/mid/horizon), 안개 색, 태양/달 빛의 방향·세기·색, 앰비언트, 별 가시성, 구름 가장자리 조명, 도시 불빛, 노출. 페이지를 일출/일몰 시점에 열어두면 장면이 분 단위로 자연스럽게 진화합니다(정각에 팔레트가 뚝 바뀌지 않음).

### 3. 라이브 날씨 — 융합 (`/api/sky` · `hooks/useLiveSeoulWeather.ts`)

공개 씬의 **기반은 Open-Meteo**(키 불필요)이고, 그 위에 가용한 소스를 **목적별 우선순위**로 융합합니다. `/api/sky`는 의도적으로 가벼운 단일 페이로드(`SkySnapshot`)만 반환하며, `/diagnostics`의 무거운 다중 소스 비교 엔진은 절대 건드리지 않습니다.

Open-Meteo 기반 호출(한 번)이 씬에 필요한 필드를 모두 가져옵니다: `temperature_2m, apparent_temperature, relative_humidity_2m, precipitation, rain, snowfall, weather_code, cloud_cover, wind_speed_10m, wind_gusts_10m, wind_direction_10m, is_day, visibility`, 현재 시각 강수확률, 오늘의 일출·일몰 (`latitude=37.5665, longitude=126.9780, timezone=Asia/Seoul`).

융합되는 항목 (각각 실패·미설정 시 조용히 빠지고 씬은 계속 동작):
- **현재 관측** — `chooseCurrent(openMeteo, kma)` (`lib/skyFusion.ts`). KMA 키가 있으면 KMA 초단기실황의 기온·강수량을 우선하고, **활성 강수가 있을 때만** condition도 KMA를 따릅니다(맑을 때 운량 미보고로 화면이 뒤집히는 것 방지). 키가 없으면 Open-Meteo를 그대로 사용. `observationSource`/`sources[]`에 출처를 기록합니다.
- **대기질** — `getFusedAirQuality()` 우선순위 **AirKorea(키) → Open-Meteo 대기질(키 없음) → 없음**. PM2.5/PM10/오존/NO₂/먼지/AOD/UV를 정규화해 씬의 **연무·가시성에 절제된** 영향만 줍니다(의학적 경고 카피 금지, 전부 클램프).
- **레이더** — RainViewer(키 없음). 서울 부근 강수 유무와 보수적 접근 방향만 추려 카메라/카피에 살짝 반영합니다. 프레임이 뒷받침할 때만 "접근 중"으로 표기 — 절대 지어내지 않음.
- **특보** — KMA 키가 있을 때만 `getWarnings()`로 공식 기상특보를 가져옵니다. 예보 확률로 특보를 **위조하지 않으며** 실패 시 조용히 `[]`.

훅(`useLiveSeoulWeather`)의 새로고침 전략:
- 최초 로드 1회
- 약 **12분**마다 갱신
- 탭이 다시 보이거나 포커스를 얻고 **데이터가 5분 이상 묵었을 때** 갱신(노트북 절전 복귀 대응)
- 동시 요청 중복 제거, 실패 시 마지막 성공 스냅샷 유지(씬이 비지 않음)

`/api/weather`(다중 프로바이더 집계 + 환경 인텔리전스)는 그대로 `/diagnostics`를 구동합니다. 융합 규칙·캐싱·시네마틱 매핑의 전체 명세는 [`docs/weather-sources.md`](docs/weather-sources.md)를 참고하세요.

### 4. 부드러운 전환 (`weatherSceneConfig.ts` · `SceneDirector`)

`buildSceneConfig(sun, weather)`가 모든 시각 파라미터(색은 sRGB 0–1 튜플, 빛/안개/구름/강수/바람/노출/포스트 강도)를 담은 평평한 **타깃 설정**을 만듭니다. `SceneDirector`는 초당 몇 회만 타깃을 재계산(매 프레임 React 리렌더 없음)하고, **라이브 설정**을 매 프레임 `lerpSceneConfig`로 타깃을 향해 보간합니다(시정수 ≈ 2.2초). 그래서 시간 흐름과 날씨 갱신이 수 초에 걸쳐 크로스페이드되고, 형상 교체나 번쩍임이 없습니다. 깨어날 때의 큰 프레임 점프는 `dt`를 클램프해 막습니다.

### 5. 시네마틱 카메라 (`CinematicCameraRig.tsx`)

OrbitControls 없음, 포인터 회전 없음, 무작위 사인 방랑 없음. 전진감은 **구름 필드가 카메라를 스쳐 흐르는** 것으로 만들고, 카메라는 수평선을 안정적으로 유지합니다. 인트로 타임라인(클램프된 `introT` 구동):
- **Shot 1 (0–1.5s)** 어두운 구름 내부, 이미 표류 중
- **Shot 2 (1.5–4s)** 증기를 뚫고 상승, 시야 제한
- **Shot 3 (4–7s)** 구름층 돌파 — 아래로 피치해 수평선과 도시 공개
- **Shot 4 (7s+)** 바람을 반영한 절제된 뱅킹과 함께 잔잔한 연속 활공

바람 세기/방향은 뱅킹·표류·구름 흐름·강수 방향에 **클램프된** 영향만 줍니다.

### 6. 구름과 대기 (`CloudField` · `Atmosphere`)

세 깊이대: **far/mid**는 size-attenuated 포인트 스프라이트(가까울수록 화면상 크게 → 진짜 시차), **near**는 카메라를 향한 대형 증기 평면이 렌즈를 스쳐 지나갑니다. 각 대역은 자기 깊이대 안에서 재활용되어 반복이 티 나지 않습니다. 퍼프 텍스처는 fbm 노이즈로 로컬 생성(외부 에셋 없음). 밀도는 라이브 운량을, 색(lit/shadow)은 시간대 가장자리 조명과 강수에 의한 어두워짐을 따릅니다.

대기는 정점 색으로 칠한 그라디언트 스카이 돔(가장 먼저, 안개 없음 → 먼 지오메트리가 이 색으로 녹아듦), 별 셸, 태양/달 가산 글로우, 그리고 거리 안개(`THREE.Fog`)로 구성됩니다. 인트로 중에는 안개를 구름 내부의 짙은 회색으로 블렌드해 "구름 속" 느낌을 만듭니다. `SeoulHorizon`은 절차적 빌딩 클러스터 + N서울타워/롯데타워 실루엣 + 한강 띠 + 야간 불빛을 멀고 낮게 배치하고, 안개가 가시성 저하 시 도시를 자연스럽게 지웁니다.

### 7. 성능 품질 티어 (`components/three/quality.ts`)

기기(코어 수·메모리·모바일 여부)로 **high / balanced / reduced**를 자동 선택하고 DPR 상한, 구름·파티클·별·빌딩 수, DoF/그레인/색수차 on/off를 조정합니다. `useFrame` 내 객체 할당 금지(재사용 벡터/컬러), 메모이즈드 지오메트리·머티리얼, 인스턴싱, 적절한 dispose, 백그라운드 탭에서 작업 감소를 적용합니다. `prefers-reduced-motion`은 팔레트는 유지하되 카메라 이동·뱅킹·난류·전진/강수 속도를 줄입니다. WebGL 미지원/런타임 실패 시 동일 팔레트를 쓰는 2D 폴백으로 전환합니다.

### 8. 선택적 시네마틱 비디오 플레이트

외부 제작 영상을 씬 위에 합성하는 **선택적·기본 비활성** 아키텍처. `NEXT_PUBLIC_CINEMATIC_PLATES=1`로 켜고 `public/cinematic/<key>.webm`을 두면, 현재 서울 시간·날씨로 플레이트를 골라 크로스페이드합니다. 파일이 없으면 아무것도 그리지 않습니다. 사양은 [`public/cinematic/README.md`](public/cinematic/README.md). **Higgsfield 등 외부 API·계정·제휴 없음.**

---

## 데이터 소스

| 소스 | 종류 | 키 | 비고 |
| --- | --- | --- | --- |
| Open-Meteo | 기상 (기반) | 불필요 | 공개 씬·진단 공통 기반. 무료 |
| Open-Meteo 대기질 | 대기질 (기반) | 불필요 | PM·오존·NO₂·먼지·AOD·UV. 무료 |
| RainViewer | 강수 레이더 | 불필요 | 서울 부근 강수·접근 신호. **표시 시 출처 표기 필수** |
| MET Norway | 기상 (비교) | UA 설정 | `/diagnostics` 교차검증. `MET_NO_USER_AGENT`에 연락처 필수 |
| 기상청 (KMA) | 기상·특보 | 🔑 | data.go.kr 무료 키 — 공식 초단기실황·단기예보·기상특보 |
| AirKorea | 대기질 | 🔑 | data.go.kr 무료 키 — 공식 측정소 대기질(우선) |

키 없는 기반(Open-Meteo + Open-Meteo 대기질 + RainViewer)만으로 공개 씬이 완전히 동작합니다. 키를 넣으면 KMA 관측·특보와 AirKorea 대기질이 **목적별 우선순위로 융합**되어 보강됩니다(§3). MET Norway는 `/diagnostics` 비교에만 참여합니다. 공식 데이터는 **위조·스크래핑하지 않으며**, 미설정·실패 시 조용히 빠지고 씬은 계속 동작합니다. 융합·캐싱·약관/출처 표기의 전체 명세는 [`docs/weather-sources.md`](docs/weather-sources.md), 향후 후보 소스는 [`docs/future-weather-sources.md`](docs/future-weather-sources.md)를 참고하세요.

### 환경 변수 (전부 선택)

`.env.example`을 `.env.local`로 복사해 채우면 해당 소스/기능이 활성화됩니다.
키는 전부 서버 사이드에서만 사용되며 브라우저로 전송되지 않습니다.
`NEXT_PUBLIC_*`만 클라이언트 노출입니다.

| 변수 | 활성화 | 형식 |
| --- | --- | --- |
| `KMA_SHORT_TERM_API_KEY` | 기상청 단기예보 조회서비스 — 공식 초단기실황·단기예보 (data.go.kr 활용신청, 별도 키) | 비우면 KMA 관측·예보만 비활성, 씬은 Open-Meteo 기반으로 정상 동작 |
| `KMA_WARNING_API_KEY` | 기상청 기상특보 조회서비스 — 공식 기상특보 (data.go.kr 활용신청, 별도 키) | 비우면 특보만 비활성. 관측·예보와 독립적이며 둘 다 선택 사항 |
| `MET_NO_USER_AGENT` | MET Norway (`/diagnostics` 비교) | **연락처 포함** 필수, 예: `SeoulSky/1.0 you@example.com` — 미설정 시 `needs-config`로 표시되고 호출 안 함 |
| `AIRKOREA_API_KEY` | AirKorea 공식 대기질 (data.go.kr 일반 인증키) | 비우면 Open-Meteo 대기질로 폴백 |
| `NEXT_PUBLIC_CINEMATIC_PLATES` | 외부 영상 플레이트 | `1`이면 활성 (기본 `0`/비움) |

Open-Meteo(기상·대기질)와 RainViewer는 키가 없어 항상 동작합니다.

## 아키텍처

```
app/page.tsx                          / — CinematicWeatherPage 렌더
app/diagnostics/page.tsx              /diagnostics — 데이터 덱 (Dashboard)
app/api/sky/route.ts                  공개 씬 전용 융합 엔드포인트 (Open-Meteo 기반 + 선택 보강)
app/api/weather/route.ts              다중 소스 집계 + 환경 인텔리전스 (diagnostics 전용)
app/api/weather/radar/route.ts        RainViewer 레이더 요약 (진단/디버그)

lib/cinematic/
  seoulTime.ts                        Asia/Seoul 연속 태양 위상
  weatherSceneConfig.ts               데이터 → 수치 시각 설정(+프레임 보간, 연무/대기질 반영)
  poeticWeatherCopy.ts                위상·날씨·레이더·먼지 기반 결정적 한국어 한 줄

hooks/
  useSeoulClock.ts                    하이드레이션 안전 라이브 시계
  useLiveSeoulWeather.ts              /api/sky 페치·새로고침·복귀 처리

components/three/
  SeoulSkyCanvas.tsx                  <Canvas> 조립 (ssr 비활성으로 동적 임포트)
  SceneDirector.tsx                   런타임 브레인: 타깃 재계산·보간·인트로·안개·노출
  CinematicCameraRig.tsx              Shot 1–4 타임라인 + 활공/뱅킹
  CloudField.tsx                      far/mid 포인트 + 전경 증기 평면
  Atmosphere.tsx                      스카이 돔·별·태양/달 글로우
  WeatherLighting.tsx                 태양/달·앰비언트·반구광
  WeatherParticles.tsx                3D 비(라인)·눈(포인트)
  SeoulHorizon.tsx                    멀고 낮은 절차적 서울 + 랜드마크 + 야간 불빛
  quality.ts                          품질 티어·DPR·WebGL 감지·reduced-motion

components/cinematic/
  CinematicWeatherPage.tsx            오케스트레이터: 로더·캔버스·폴백·단축키
  MinimalWeatherOverlay.tsx           무비 타이틀 오버레이 (글래스 카드 없음)
  CinematicGrade.tsx                  CSS 비네트 + SVG 필름 그레인 (포스트프로세싱 대체)
  CinematicLoader.tsx                 블랙 → 인트로로 페이드되는 프리미엄 로더
  WebGLFallback.tsx                   동일 팔레트의 2D 폴백
  CinematicPlate.tsx                  선택적 영상 플레이트(기본 비활성)
  SeoulSkyline.tsx · WeatherParticles.tsx   2D 폴백용 SVG·CSS 파티클

lib/  types.ts · conditions.ts · format.ts · cache.ts · compare.ts · seoul.ts
      skyFusion.ts                    현재 관측 융합 규칙 (KMA ↔ Open-Meteo)
      airQuality.ts                   한국 통합대기지수 밴드 + 연무 환산
      providers/
        open-meteo.ts · met-norway.ts · registry.ts · base.ts
        kma.ts · kma-mapping.ts       기상청 관측·예보·특보 + 순수 카테고리 매핑
        air-quality.ts                AirKorea → Open-Meteo 대기질 융합
        radar.ts                      RainViewer 타일 디코딩·접근 분석

components/  (진단 덱) Dashboard.tsx · Diagnostics.tsx · EnvironmentPanel.tsx
             ConfidencePanel · ProviderComparison · CurrentHero · …
```

테스트는 `node --test`로 실행합니다(`npm test`): `lib/skyFusion.test.ts`, `lib/airQuality.test.ts`, `lib/providers/kma-mapping.test.ts` — 융합·대기질 밴드·KMA 카테고리 매핑의 순수 로직을 커버합니다.

## 한계 (정직하게)

- 절차적 WebGL 합성입니다 — **실제 항공 촬영 footage가 아닙니다.** 다큐멘터리 영화의 질감을 지향하되, 진짜 영상은 아닙니다.
- 구름은 카메라 지향 스프라이트 기반입니다(레이마칭 볼류메트릭 아님) — 거대한 스케일감은 깊이대·시차·안개로 만듭니다.
- 색은 ACES 톤매핑으로 그레이딩되어 의도적으로 시네마틱합니다. 모니터/환경에 따라 다소 어둡거나 차분해 보일 수 있습니다.
- 캐시는 메모리 기반(서버 재시작 시 초기화, stale-while-revalidate). 강수확률은 Open-Meteo 모델 값입니다.
- 대기질은 씬의 **연무·가시성에만 절제되게** 매핑됩니다(전부 클램프). 건강 지표가 아니며 의학적 판단에 쓰지 마세요.
- RainViewer 레이더 이미지를 **표시하는 곳에는 출처 표기가 필수**입니다(약관). 접근 방향은 보수적 추정이며 프레임이 뒷받침할 때만 표기합니다.
- KMA **기상특보**와 **AirKorea**는 data.go.kr에서 해당 서비스 구독이 필요합니다 — 코드 경로는 구현·검증되었으나 본 프로젝트의 개발 키로는 라이브 응답을 확인하지 못했고(미구독 시 `Forbidden`), 그 경우 안전하게 빈 결과로 강등됩니다.
- 서울 전용 — 의도된 설계. 비공식 개인 프로젝트, 항공/안전 의사결정에 사용 금지.
- 매우 구형 GPU/모바일에서는 reduced 티어 또는 2D 폴백으로 동작합니다.
