/**
 * The cinematic plate manifest — the single, plain-serializable source of truth
 * for the externally-generated aerial footage library.
 *
 * Each plate is one continuous ~8 s loop-friendly aerial shot representing a
 * broad weather + time-of-day *category*. At runtime {@link selectCinematicPlate}
 * picks a key from live Seoul conditions; the page composites the matching clip
 * as the distant cinematic base plate while the real-time three.js scene adds
 * the live, current-conditions atmosphere on top (see CinematicWeatherPage).
 *
 * IMPORTANT: this file contains NO credentials, generation URLs, tool metadata
 * or secrets — only public asset paths and descriptive category metadata. The
 * footage itself is produced offline (via the Higgsfield tools in the Claude
 * CLI session) and dropped into public/cinematic/generated/. The app is fully
 * functional when every one of these files is missing — `generated: false`
 * keeps a plate inert, and even a `generated: true` plate whose file is absent
 * simply errors the <video> and falls back to the procedural scene.
 */

export type CinematicPlateKey =
  | "clear-day"
  | "clear-night"
  | "dawn"
  | "sunset"
  | "cloudy"
  | "fog"
  | "rain"
  | "night-rain"
  | "storm"
  | "snow"
  | "overcast-night";

export interface CinematicPlateDefinition {
  key: CinematicPlateKey;
  /** Preferred modern source (VP9/AV1). Omitted until an optimized file exists. */
  webmSrc?: string;
  /** H.264 fallback / current source-of-record. */
  mp4Src?: string;
  /** Optional first-frame still shown before the video can play. */
  posterSrc?: string;
  /** True only when a real source file for this key exists in the repo tree. */
  generated: boolean;
  /** Approximate clip length, for crossfade-before-loop timing. */
  durationSeconds?: number;
  /** Human-readable weather categories this plate stands in for. */
  weatherConditions: string[];
  /** Human-readable time-of-day phases this plate stands in for. */
  timePhases: string[];
}

const GEN = "/cinematic/generated";

/**
 * The full library. Every key below has a real `-source.mp4` in
 * public/cinematic/generated/ (git-ignored binaries), generated offline with
 * Google Veo 3.1 Lite (8 s, 16:9, no audio). Selection never *requires* a plate
 * to be generated — flip `generated` to false (or delete the file) and that
 * condition simply routes to the procedural scene.
 */
export const CINEMATIC_PLATES: Record<CinematicPlateKey, CinematicPlateDefinition> = {
  "clear-day": {
    key: "clear-day",
    mp4Src: `${GEN}/clear-day-source.mp4`,
    generated: true,
    durationSeconds: 8,
    weatherConditions: ["clear", "partly-cloudy"],
    timePhases: ["early-morning", "daytime", "late-afternoon"],
  },
  "clear-night": {
    key: "clear-night",
    mp4Src: `${GEN}/clear-night-source.mp4`,
    generated: true,
    durationSeconds: 8,
    weatherConditions: ["clear", "partly-cloudy"],
    timePhases: ["night", "deep-night"],
  },
  dawn: {
    key: "dawn",
    mp4Src: `${GEN}/dawn-source.mp4`,
    generated: true,
    durationSeconds: 8,
    weatherConditions: ["clear", "partly-cloudy", "fog"],
    timePhases: ["pre-dawn", "sunrise"],
  },
  sunset: {
    key: "sunset",
    mp4Src: `${GEN}/sunset-source.mp4`,
    generated: true,
    durationSeconds: 8,
    weatherConditions: ["clear", "partly-cloudy"],
    timePhases: ["golden-hour", "sunset", "blue-hour"],
  },
  cloudy: {
    key: "cloudy",
    mp4Src: `${GEN}/cloudy-source.mp4`,
    generated: true,
    durationSeconds: 8,
    weatherConditions: ["cloudy", "overcast"],
    timePhases: ["daytime", "early-morning", "late-afternoon"],
  },
  fog: {
    key: "fog",
    mp4Src: `${GEN}/fog-source.mp4`,
    generated: true,
    durationSeconds: 8,
    weatherConditions: ["fog"],
    timePhases: ["any"],
  },
  rain: {
    key: "rain",
    mp4Src: `${GEN}/rain-source.mp4`,
    generated: true,
    durationSeconds: 8,
    weatherConditions: ["drizzle", "rain", "heavy-rain", "sleet"],
    timePhases: ["daytime", "early-morning", "late-afternoon"],
  },
  "night-rain": {
    key: "night-rain",
    mp4Src: `${GEN}/night-rain-source.mp4`,
    generated: true,
    durationSeconds: 8,
    weatherConditions: ["drizzle", "rain", "heavy-rain", "sleet"],
    timePhases: ["night", "deep-night", "blue-hour"],
  },
  storm: {
    key: "storm",
    mp4Src: `${GEN}/storm-source.mp4`,
    generated: true,
    durationSeconds: 8,
    weatherConditions: ["thunderstorm"],
    timePhases: ["any"],
  },
  snow: {
    key: "snow",
    mp4Src: `${GEN}/snow-source.mp4`,
    generated: true,
    durationSeconds: 8,
    weatherConditions: ["snow", "sleet"],
    timePhases: ["any"],
  },
  "overcast-night": {
    key: "overcast-night",
    mp4Src: `${GEN}/overcast-night-source.mp4`,
    generated: true,
    durationSeconds: 8,
    weatherConditions: ["cloudy", "overcast"],
    timePhases: ["night", "deep-night"],
  },
};

export const CINEMATIC_PLATE_KEYS = Object.keys(CINEMATIC_PLATES) as CinematicPlateKey[];

export function getPlateDefinition(key: CinematicPlateKey): CinematicPlateDefinition {
  return CINEMATIC_PLATES[key];
}

/** True when a real source file is declared for this key. */
export function isPlateGenerated(key: CinematicPlateKey): boolean {
  return CINEMATIC_PLATES[key].generated === true;
}

/** Ordered list of <source> URLs (webm preferred, mp4 fallback) for a plate. */
export function plateSources(key: CinematicPlateKey): { src: string; type: string }[] {
  const def = CINEMATIC_PLATES[key];
  const out: { src: string; type: string }[] = [];
  if (def.webmSrc) out.push({ src: def.webmSrc, type: "video/webm" });
  if (def.mp4Src) out.push({ src: def.mp4Src, type: "video/mp4" });
  return out;
}
