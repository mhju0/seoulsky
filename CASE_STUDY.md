# SeoulSky Case Study

SeoulSky is a Seoul-only cinematic live weather web app built around one primary route, `/sky`. The project treats weather as an atmospheric product experience rather than a generic dashboard: the default view is a full-screen Seoul scene, and the data deck answers the practical questions a user needs before deciding what to do next.

## Product Problem

Most weather interfaces optimize for broad coverage and dense data. SeoulSky takes the opposite position: it focuses only on Seoul, makes that constraint visible in the product, and spends the saved complexity on presentation quality, source agreement, and a clearer default flow. The core questions are:

- What is Seoul like now?
- Is rain coming?
- What is the forecast?
- How trustworthy is the forecast?
- Are sources agreeing?

## Design Direction

The app should feel like a cinematic weather experience, not a control-room dashboard. The hero view leads with atmosphere, current conditions, and a quiet call to action. Technical detail is available, but it does not dominate the first impression. The data deck uses a desktop-first layout for MacBook and laptop browsers, while mobile remains functional-only: it should avoid obvious breakage without trying to match the desktop composition.

## Key User Flow

The user lands on `/sky` in the hero scene. They can open the data deck from the CTA or by pressing `D`. The deck presents current conditions, radar, forecast, and confidence in a single focused flow. Pressing `Esc` returns to the cinematic hero. This keeps the product simple: one route, one primary mode switch, and no navigation burden.

## Technical Architecture Highlights

- Next.js App Router provides the `/sky` route and API endpoints.
- `WeatherExperienceShell` owns live weather fetching, Seoul time, rendering capability checks, keyboard shortcuts, and view state.
- `SceneStage` keeps the background scene persistent across hero and data views.
- `SkyView` composes the hero and data deck as fixed layers instead of route transitions.
- `/api/sky` is the lightweight public weather snapshot used by the live scene.
- `/api/weather` supports deeper confidence and source-comparison diagnostics.
- The visual system is concentrated in `.sky-*` CSS utilities and section components rather than spread across one-off styles.

## Data And Reliability Approach

SeoulSky uses Open-Meteo as the keyless baseline and can incorporate optional providers for additional signal. The app favors graceful degradation over false precision: if a provider is unavailable, the UI should continue with available sources and avoid inventing certainty. The client preserves last-good data, refreshes on focus when stale, and separates the fast scene snapshot from heavier provider comparison. Ground Station exposes confidence, source agreement, and advanced diagnostics without making diagnostics the default product story.

## UX Improvements Completed

- Clarified the hero CTA and section hierarchy.
- Improved Radar and Forecast fit across laptop-sized desktop viewports.
- Added intentional radar loading and empty states.
- Added first-load weather failure handling.
- Simplified Ground Station into a confidence-first default view.
- Kept advanced diagnostics behind progressive disclosure.
- Adjusted mobile hero framing enough for functional support.
- Polished the desktop data deck for MacBook-style viewport sizes.
- Removed the known Turbopack/NFT runtime tracing warning by narrowing live reliability imports.

## Screenshots

- [Hero](public/screenshots/hero.webp)
- [Current data](public/screenshots/data-current.webp)
- [Radar](public/screenshots/radar.webp)
- [Forecast](public/screenshots/forecast.webp)
- [Confidence](public/screenshots/confidence.webp)
- [Advanced confidence diagnostics](public/screenshots/confidence-advanced.webp)

## Constraints And Trade-offs

- Seoul-only is intentional and should not be treated as missing coverage.
- Desktop-first is intentional; the primary target is a laptop browser experience.
- Mobile is functional-only and should avoid obvious breakage rather than receive full design parity.
- Optional weather providers can improve confidence but should not be required for the basic app to run.
- Radar data can be slower than the scene snapshot, so radar loading and empty states need to be explicit.
- Advanced diagnostics are useful for transparency, but surfacing them too early makes the product feel less focused.

## Maintenance Boundaries

The project is complete and maintained rather than actively expanded. The most valuable future work is defensive: route-level API smoke coverage, visual regression checks at the documented viewports, monitoring of the scheduled reliability job, and a self-hosted font strategy if fully offline builds become a requirement.
