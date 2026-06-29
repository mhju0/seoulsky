# SeoulSky

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)
![WebGL](https://img.shields.io/badge/rendering-raw%20WebGL-990000)
![Tests](https://img.shields.io/badge/tests-158%20passing-brightgreen)

> **서울의 하늘을 대시보드가 아니라 한 편의 영화처럼 보여주는 실시간 웹 경험.** API 키 없이 켜지고, 데이터 출처 하나가 죽어도 장면은 절대 끊기지 않는다.

**▶ 라이브 — `https://seoulsky.vercel.app/sky`**  ·  단일 라우트 `/sky`  ·  시간·날씨 기준은 항상 `Asia/Seoul`  ·  `D` 키로 영화 화면 ↔ 데이터 대시보드 전환

<!-- ![SeoulSky](docs/screenshot.png) -->
<!-- *실시간 한강 배경 위에 떠 있는 liquid-glass 계기판 — /sky* -->

Seoul-only 날씨를 풀스크린 커스텀 셰이더로 그리고, 여러 기상 출처를 하나의 교차검증된 장면으로 융합한다. three.js도, 무거운 차트 라이브러리도 없이 — 쿼드 한 장과 폴백 체인으로 버틴다.

---

## 왜 이렇게 만들었나

- **raw WebGL 직접 렌더링** — 풀스크린 커스텀 셰이더를 three.js 없이 구현. 쿼드 하나면 되는 화면에 씬 그래프와 reconciler는 순수 오버헤드라 걷어냄.
- **애니메이션 루프에서 React 제거** — 매 프레임 도는 작업이 React 상태를 절대 건드리지 않음. 컨텍스트 3분할(`Field` · `Clock` · `View`)로 리렌더 입자도를 제어해 초 단위 시계가 장면을 다시 그리지 않음.
- **멀티 소스 융합 + graceful degradation** — Open-Meteo 베이스라인 위에 KMA · MET Norway · Pirate Weather · WeatherAPI를 키 선택적으로 쌓음. 출처가 실패하면 만료값을 조용히 유지하고 데이터를 지어내지 않음.
- **장면 API / 분석 API 분리** — `/api/sky`는 빠른 융합 스냅샷(씬 hot path), `/api/weather`는 5-제공자 교차검증(Ground Station 전용). 분석 호출이 렌더링을 막지 않음.
- **절대 비지 않는 폴백 체인** — `raw WebGL → pure-CSS → still plate → live FX overlay`. 어느 단계가 비어도 아래가 받쳐줘서 404 plate조차 씬을 깨지 않음.
- **AI를 오프라인 파이프라인에 가둠** — 랜드마크 still plate는 Higgsfield로 오프라인 생성, `landmark × condition × anchor` 매니페스트로 색인. 런타임엔 조회만 — 생성 지연·비용·키 노출 없음.

---

## 기술 스택

| | |
|---|---|
| 프레임워크 | **Next.js 16** App Router · **React 19** · **TypeScript 5** strict |
| 스타일 | **Tailwind v4** config-less · 비주얼 시스템은 `globals.css`의 `.sky-*` |
| 배경 | **raw WebGL** 단일 쿼드 커스텀 셰이더 (three.js 없음) |
| 애니메이션 | **framer-motion** 스크롤 리빌 · `useInView` 지연 로드 |
| 데이터 | Open-Meteo + RainViewer (키 없이 동작) · 공식 출처는 선택적 보강 |
| AI 애셋 | **Higgsfield** 오프라인 빌드 파이프라인 전용 |

---

## 실행

```bash
npm run dev                 # http://localhost:3000/sky  (환경변수 불필요)
npm run build && npm start
npx tsc --noEmit            # 타입 체크
npm test                    # 158 tests · Node 22+
```

선택적 출처: `cp .env.example .env.local`  ·  개발용 오버라이드: `/sky?cond=<조건>&hour=<0–23>`

<sub>비공식 개인 프로젝트 · 항공·안전 용도 아님</sub>
