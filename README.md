# SeoulSky

> 서울의 날씨를 대시보드가 아니라, 살아 움직이는 하나의 영화적 장면으로 보여주는 실시간 웹 경험.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)
![WebGL](https://img.shields.io/badge/Rendering-raw%20WebGL-990000)

<!-- 권장: 여기에 /sky 화면을 5~10초 녹화한 GIF나 MP4를 넣으세요.
     비주얼이 핵심인 프로젝트이므로, README에서 가장 영향력 있는 한 가지입니다. -->

> **라이브 데모:** _링크 추가_ · **스크린샷:** _위에 히어로 GIF 추가_

---

## 왜 만들었나

SeoulSky는 개인적인 불편함에서 시작했습니다. 서울에 살면서, 어느 한 곳의 예보도 온전히 믿기가 어려웠습니다. 하나의 예보만 보고 하루를 계획했다가 빗나가는 일이 반복됐고, 그래서 "가장 정확한 출처"를 찾아 헤매는 대신 **애초에 하나의 출처에 의존하지 않는** 것을 직접 만들기로 했습니다.

이 불편함이 그대로 프로젝트의 핵심 원칙이 됐습니다 — **단일 출처에 의존하지 않고, 데이터를 절대 지어내지 않는다.** SeoulSky는 여러 기상 출처를 동시에 가져와 하나의 일관된 상태로 융합하고, 불확실성에 대해 정직합니다. 어떤 출처가 빠지거나, 느리거나, 오래된 값일 때 빈자리를 채우려고 숫자를 만들어내지 않습니다. 대신 보여줄 수 있는 만큼만 조용히 줄여서 보여주고, 장면 자체는 절대 깨지지 않습니다.

두 번째 동기는 기술적 경험이었습니다. 생성형 AI를 런타임의 장식이 아니라 **빌드 파이프라인 안의 제약된 한 부품으로** 실제로 다뤄보고 싶었습니다. 이 선택이 아래에 설명할 오프라인 애셋 파이프라인으로 이어졌습니다.

---

## 무엇을 만들었나

SeoulSky는 단일 라우트 **`/sky`** 위에 올라간, 페이지 전환이 없는 하나의 연속된 날씨 경험입니다. 숫자 격자(grid) 대신, 서울의 현재 날씨를 영화적 장면으로 렌더링합니다. 시간대와 날씨에 맞게 색보정된 정지 랜드마크 plate가 배경에 깔리고, 그 위로 실시간 기상 효과(비·눈·번개·안개·god-ray)가 얹힙니다.

핵심 설계는 다음과 같습니다.

- **항상 서울 기준.** 보는 사람이 어디에 있든, 시간대와 낮/밤·태양 위상은 언제나 `Asia/Seoul` 기준으로 계산합니다.
- **API 키 없이 동작.** Open-Meteo + RainViewer 베이스라인만으로 키 하나 없이 돌아갑니다. 공식 출처(KMA, AirKorea, MET Norway, Pirate Weather, WeatherAPI)는 *선택적 보강*일 뿐이며, 미설정이거나 실패하면 각각 조용히 `null`/`[]`로 떨어집니다.
- **절대 비지 않는 배경.** 애셋도 네트워크도 없는 최악의 경우에도 무언가는 항상 그려집니다(아래 폴백 체인 참고).

---

## 화면 구성

배경 장면(`SceneStage`)은 한 번 만들어져 고정된 채 두 뷰 뒤에 항상 떠 있고, 그 위 HUD는 항상 마운트되어 있는 **두 개의 뷰**가 `D` / `Esc` 키로 크로스페이드(약 500ms)되며 전환됩니다.

- **Hero 뷰 — `Arrival`**: 라이브 장면 위에 현재 상태를 얹은 몰입형 화면. "press D" 힌트가 함께 표시됩니다.
- **Data 뷰 — 스크롤 대시보드**: `Instruments`(현재 관측값) → `Forecast`(예보) → `Sun & Sky`(태양 위상 + 바람 차트) → `Ground Station`(데이터 출처·신뢰도 패널)로 이어집니다. 데이터 뷰가 떠 있는 동안 배경 장면은 일시정지합니다.

`Ground Station`은 이 프로젝트의 정직함을 UI로 드러내는 곳입니다 — 지금 어떤 출처가 살아 있고, 어떤 출처가 degrade됐으며, 융합 결과가 어떻게 나왔는지를 그대로 보여줍니다.

---

## 엔지니어링 하이라이트

각 항목은 기본값을 따른 게 아니라 **결정 → 이유 → 트레이드오프**가 있는 선택입니다. 면접에서 가장 이야기하고 싶은 부분이기도 합니다.

### 1. three.js 대신 raw WebGL

애니메이션 하늘 배경은 풀스크린 사각형(쿼드) 하나에 커스텀 셰이더를 입힌 것이고, 이를 three.js / React Three Fiber 없이 **raw WebGL로 직접** 렌더링합니다.

- **이유:** 쿼드 하나를 그리는 데 씬 그래프와 reconciler는 순수한 오버헤드입니다. 관리할 메시도, 카메라 리그도, 객체 트리도 없습니다. 필요한 건 셰이더와 삼각형 두 개뿐입니다.
- **트레이드오프:** R3F의 편의성과 생태계를 포기하고 보일러플레이트(컨텍스트 셋업, 유니폼 전달, 리사이즈 처리)를 떠안는 대신, 더 작은 번들과 GPU에 더 가까운 제어, 그리고 프레임 루프 전체에 대한 통제권을 얻었습니다.

### 2. 애니메이션 루프에서 React를 빼기

라이브로 움직이는 UI에서 가장 까다로운 제약은 리렌더 입자도(granularity)입니다. SeoulSky는 **매 프레임 도는 작업이 React 상태를 절대 건드리지 않도록** 설계했습니다.

- WebGL 컨텍스트는 페이지가 사는 동안 **한 번 만들어져 유지**됩니다(재생성·언마운트 없음).
- 셸(`WeatherExperienceShell`)은 단 하나의 fetch만 돌립니다 — `/api/sky`를 약 12분마다 폴링하고, 탭이 다시 보이거나 포커스될 때 데이터가 오래됐을 때(5분 초과)만 갱신하며, 진행 중인 요청은 de-dupe하고, 실패해도 마지막으로 성공한 스냅샷을 유지합니다(장면이 비지 않음).
- 상태는 갱신 빈도에 따라 **세 개의 컨텍스트로 분리**되어, 초 단위로 바뀌는 값이 그것과 무관한 무거운 장면을 다시 렌더링시키지 않습니다.
  - `WeatherFieldProvider` — 거친 상태(스냅샷, 클램핑된 비주얼 `target`, 태양 위상). 메모이즈된 `SceneStage`와 대부분 섹션은 **이것만** 구독합니다.
  - `WeatherClockProvider` — 초 단위 시계. 시간을 표시하는 컴포넌트만 구독합니다.
  - `WeatherViewProvider` — `hero | data`.
  - `SkyImageProvider` — 정지 plate의 선택·프리로드·색보정.
- 결과적으로 매 프레임 React 리렌더 없이 부드러운 비주얼이 유지됩니다.

### 3. 멀티 소스 융합과 graceful degradation

데이터 계층은 **keyless-first**입니다 — 키가 하나도 없어도 동작하고, 키를 더할수록 풍부해집니다.

- 각 출처는 공통 `WeatherProvider` 인터페이스 뒤에서 **제공자 + 캐시 추상화**로 동작하며, 우선순위(registry 순서)는 Open-Meteo → MET Norway → KMA → Pirate Weather → WeatherAPI 입니다.
- 융합 규칙은 임의적이지 않습니다. 예를 들어 기온과 실시간 강수는 KMA 관측을 우선하되, **KMA가 "현재 강수 중"이라고 보고할 때만** KMA의 상태(condition)를 채택하고, 구름·시정·바람·낮밤·태양은 항상 Open-Meteo를 사용합니다. 레이더는 프레임이 뒷받침할 때만 접근 방향을 보고하고(없으면 만들어내지 않음), 특보는 KMA 키가 있을 때만 — 예보 확률로 지어내지 않습니다.
- 캐싱은 in-memory TTL(5분) + **stale-while-revalidate**: 상위 출처가 실패하면 만료된 항목을 `stale`로 표시해 던지지 않고 계속 내어줍니다.
- 모든 결정의 바탕에는 **지어낸 데이터 없음**과 **UI가 자기 출처에 대해 정직하다**는 두 원칙이 있습니다.

### 4. 장면용 API와 분석용 API를 분리

- `GET /api/sky` — 라이브 장면을 구동하는 **가볍게 융합된 스냅샷**. 키 없이 동작하고 빠릅니다.
- `GET /api/weather` — 5개 제공자 교차검증, 신뢰도·비교, 환경 출처, 캐시 진단까지 담은 **무거운 페이로드**. `Ground Station` 섹션에서만 소비합니다.
- 장면이 무거운 분석 호출에 발목 잡히지 않도록 **일부러 두 경로를 나눴습니다.** 보이는 화면은 가볍게, 깊은 데이터는 필요할 때만.

### 5. 절대 비지 않는 폴백 체인

`SceneStage`는 뒤에서 앞으로 합성되며, 빈 화면을 절대 보여주지 않도록 설계됐습니다.

1. **절차적 대기 필드** — raw WebGL 배경(에러 바운더리로 감쌈). WebGL을 못 쓰거나 GL 컨텍스트가 throw하면 순수 CSS 폴백으로 떨어집니다.
2. **`ImageField`** — 조건·시간대에 맞는 정지 랜드마크 plate. 아직 생성되지 않아 404가 나면 조용히 `null`로 해소되어 뒤의 절차적 필드가 보입니다.
3. **`FXOverlay`** — 비·눈·번개·안개·god-ray 실시간 효과.

어느 단계가 비어도 그 아래 단계가 받쳐주므로, 사용자에게는 늘 완성된 장면만 보입니다.

---

## AI 애셋 파이프라인 (Higgsfield)

랜드마크 비주얼은 AI(Higgsfield)로 생성하지만, **오직 오프라인(빌드·저작 시점)에서만** 만들고 런타임에서는 절대 호출하지 않습니다.

- **이유:** 런타임 생성은 예측 불가능한 지연, 요청당 비용, 그리고 생성 크레덴셜의 클라이언트 노출을 뜻합니다. 날씨 앱의 핫 패스에 둘 이유가 없습니다.
- 대신 애셋을 미리 만들어 정적 파일로 두고, `랜드마크 × 조건 × 시간대(day · golden · night)`로 키를 잡은 매니페스트(`public/sky/manifest.json`)로 색인합니다. 런타임에는 맞는 plate를 **고르기만** 합니다 — 빠르고, 결정적이고, 비용이 들지 않습니다.
- plate 선택 로직에는 **dry-sky 불변식**이 박혀 있습니다: 맑음·구름조금 하늘은 절대 비/눈 plate를 고르지 않습니다.

이 결정은 "AI를 어디에 두느냐"에 대한 의식적인 선택이었고, keyless-first · no-fabrication 철학과 정확히 같은 방향을 봅니다.

---

## 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | **Next.js 16** (App Router) | 단일 경험 `/sky`. `/`, `/atmosphere`, `/diagnostics`는 실제 HTTP 리다이렉트. |
| UI | **React 19**, **TypeScript 5** (strict) | |
| 스타일 | **Tailwind CSS v4** (`@tailwindcss/postcss`) | 설정 파일 없음. 비주얼 시스템 대부분은 `globals.css`에 손수 작성한 `.sky-*` CSS. |
| 애니메이션 | **framer-motion** | 스크롤 리빌, `useInView` 기반 지연 fetch. |
| 차트 | **recharts** | `Sun & Sky` 섹션의 바람 차트. |
| 배경 | **raw WebGL** | 단일 쿼드 커스텀 셰이더 — three.js 미사용, `ssr: false`로 동적 임포트. |
| AI 애셋 | **Higgsfield** | 오프라인·빌드 시점 전용 파이프라인. |
| 데이터 | 다중 기상 출처 | 커스텀 융합 + 캐시 추상화, 키 없이 동작. |

---

## 실행 방법

```bash
npm run dev                 # 개발 서버 → http://localhost:3000  (환경변수 불필요)
npm run build && npm start  # 프로덕션 빌드 + 서빙
npm run lint                # ESLint (flat config, eslint.config.mjs)
npx tsc --noEmit            # 타입 체크 (빌드는 Next가 담당, tsc는 noEmit 전용)
npm test                    # 전체 유닛 테스트: node --test "lib/**/*.test.ts"
```

- **Node 버전이 중요합니다.** 테스트는 별도 빌드 없이 Node의 내장 TypeScript type-stripping으로 `.ts`를 직접 실행하므로 **Node 22 이상**이 필요합니다(이 저장소는 Node 24에서 개발). `npm test` 중 뜨는 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 무해합니다.
- **개발 전용 비주얼 리뷰 오버라이드:** `/sky?cond=<조건>&hour=<0–23>` 로 임의의 날씨·시간대를 강제해 노을·안개·눈·야간을 실시간 조건 없이도 점검할 수 있습니다(프로덕션에서는 무력화되어 동작이 동일).
- 환경변수는 모두 선택이며 서버 전용입니다. `cp .env.example .env.local` 후 필요한 키만 채우면 됩니다.

---

## 프로젝트 구조

```
app/
  sky/layout.tsx          # 서버 컴포넌트: WeatherExperienceShell + <noscript> 폴백(크롤러/무JS용)
  sky/page.tsx            # SkyView — HUD 포그라운드
  api/sky/                # 장면 구동용 융합 스냅샷 (키 없이 동작, 빠름)
  api/weather/            # 5-제공자 교차검증 (Ground Station 전용)
components/atmosphere/
  WeatherExperienceShell  # 한 번 생성되고 리마운트되지 않는 클라이언트 셸 (심장부)
  WeatherFieldContext     # 리렌더 입자도를 나눈 컨텍스트들
  SkyView                 # D/Esc 로 크로스페이드되는 두 뷰
  scene/SceneStage        # 절대 비지 않는 폴백 체인
  scene/AtmosphericFieldBackground  # raw WebGL 배경 (단일 셰이더)
  scene/ImageField        # 정지 랜드마크 plate
  FXOverlay               # 비/눈/번개/안개/god-ray
  sections/               # Arrival · Instruments · Forecast · Sun & Sky · Ground Station
lib/
  skyFusion.ts            # 융합 규칙 (chooseCurrent 등)
  providers/              # 출처별 제공자 + 캐시 추상화 (registry가 우선순위)
  cinematic/              # 순수·테스트 가능한 시간/장면 로직 (seoulTime, skyImageField, skyPalette …)
  atmosphere/             # 순수 비주얼 헬퍼 (weatherVisualConfig …)
  cache.ts · seoul.ts     # SWR 캐시 · 서울 좌표/상수
```

---

## 앞으로의 계획

- **애셋 커버리지 공백 메우기** — 흐림·구름조금 *야간* 같은 조건×시간대 plate를 더 생성해 폴백 의존도를 낮추기.
- **은퇴한 비디오 시대 모듈 정식 제거** — 현재 정지 plate가 장면을 담당하지만 일부 비디오 시대 모듈이 아직 import되어 있어, grep 후 안전하게 정리.
- **융합 모델 확장** — 출처별 신뢰도 가중치를 도입하고 `Ground Station`에 노출.
- **다국어 지원** — UI 영문화 패스.

---

## 출처 및 라이선스

- **레이더:** RainViewer — 화면에 "© RainViewer" 표기 필요(이미 `Ground Station`에 포함).
- **예보:** Open-Meteo, MET Norway 외 — MET Norway는 연락처가 담긴 `MET_NO_USER_AGENT`가 있어야 호출됩니다.
- **관측 · 특보 · 대기질:** KMA, AirKorea 등 (선택적, 키가 있을 때만).
- **랜드마크 이미지:** Higgsfield로 오프라인 생성.

각 출처의 데이터는 해당 출처의 이용약관을 따르며, 출처 표기는 앱 UI에 유지됩니다.

---

<sub>비공식 개인 프로젝트입니다. 항공·안전 용도가 아닙니다. — "이 예보를 못 믿겠다"는 불편함을, 여러 출처를 융합하고 정직하게 degrade하며 데이터를 지어내지 않는 시스템으로 바꿔본 작업.</sub>
