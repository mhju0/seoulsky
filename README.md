# SeoulSky

> 서울의 날씨를 대시보드가 아니라 영화적 장면으로 보여주는 실시간 웹 경험. API 키 없이 동작.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)
![WebGL](https://img.shields.io/badge/Rendering-raw%20WebGL-990000)

단일 라우트 `/sky` — 전환 없는 하나의 연속된 화면. 시간대와 날씨는 항상 `Asia/Seoul` 기준.  
`D` 키로 영화적 도착 화면 ↔ 스크롤 데이터 대시보드 전환.

---

## 엔지니어링 하이라이트

- **raw WebGL 직접 렌더링** — 풀스크린 커스텀 셰이더를 three.js 없이 구현. 쿼드 하나에 씬 그래프와 reconciler는 순수 오버헤드.
- **애니메이션 루프에서 React 제거** — 매 프레임 도는 작업이 React 상태를 절대 건드리지 않음. 컨텍스트 3분할(`WeatherFieldProvider` · `WeatherClockProvider` · `WeatherViewProvider`)로 리렌더 입자도를 제어해 초 단위 시계가 장면을 다시 그리지 않음.
- **멀티 소스 융합 + graceful degradation** — Open-Meteo 베이스라인 위에 KMA · MET Norway · Pirate Weather · WeatherAPI를 키 선택적으로 쌓음. 각 출처가 실패하면 만료값(`stale`)을 조용히 유지하고 장면은 절대 깨지지 않음. 데이터를 지어내지 않는다.
- **장면 API / 분석 API 분리** — `/api/sky`는 빠른 융합 스냅샷(씬 hot path), `/api/weather`는 5-제공자 교차검증(Ground Station 전용). 분석 호출이 씬 렌더링을 막지 않음.
- **절대 비지 않는 폴백 체인** — `raw WebGL → pure-CSS fallback → still landmark plate → live FX overlay`. 어느 단계가 비어도 그 아래가 받쳐줌. 404 plate도 씬을 깨지 않음.
- **AI를 오프라인 파이프라인에 가둠** — 랜드마크 still plate는 Higgsfield로 오프라인 생성, `landmark × condition × anchor` 매니페스트로 색인. 런타임에는 조회만 — 생성 지연·비용·자격증명 노출 없음.

---

## 기술 스택

| | |
|---|---|
| 프레임워크 | **Next.js 16** App Router · **React 19** · **TypeScript 5** strict |
| 스타일 | **Tailwind CSS v4** config-less · 비주얼 시스템은 `globals.css`의 `.sky-*` CSS |
| 배경 | **raw WebGL** 단일 쿼드 커스텀 셰이더, three.js 없음 |
| 애니메이션 | **framer-motion** 스크롤 리빌 · **recharts** 바람 차트 |
| 데이터 | Open-Meteo + RainViewer (키 없이 동작), 공식 출처는 선택적 보강 |
| AI 애셋 | **Higgsfield** 오프라인 빌드 파이프라인 전용 |

---

## 실행

```bash
npm run dev                 # http://localhost:3000  (환경변수 불필요)
npm run build && npm start
npx tsc --noEmit            # 타입 체크
npm test                    # Node 22+ 필요
```

선택적 출처 추가: `cp .env.example .env.local`  
개발용 오버라이드: `/sky?cond=<조건>&hour=<0–23>`

---

<sub>비공식 개인 프로젝트. 항공·안전 용도 아님.</sub>
