"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import type { SkySnapshot } from "@/lib/types";

/**
 * OPTIONAL externally-generated cinematic footage layer (e.g. Higgsfield-style
 * plates). Disabled by default — the real-time 3D scene is the product and must
 * work without any of these files. When enabled, it picks a plate from the live
 * Seoul time + weather and crossfades between plates; if a file is missing the
 * <video> errors and this renders nothing (never a broken box).
 *
 * Drop files at public/cinematic/<key>.webm to activate. See README +
 * public/cinematic/README.md for the expected encoding/resolution/loop spec.
 * No Higgsfield API, account, or affiliation is involved.
 */

type PlateKey = "clear-day" | "clear-night" | "sunrise" | "sunset" | "cloudy" | "rain" | "storm";

function pickPlate(snapshot: SkySnapshot): PlateKey | null {
  const cur = snapshot.current;
  const sun = computeSunPhase({
    sunrise: snapshot.sun.sunrise,
    sunset: snapshot.sun.sunset,
    isDayHint: cur.isDay,
  });
  switch (cur.condition) {
    case "drizzle":
    case "rain":
    case "heavy-rain":
    case "sleet":
      return "rain";
    case "thunderstorm":
      return "storm";
    case "fog":
    case "overcast":
    case "cloudy":
    case "snow":
      return "cloudy";
    default:
      break;
  }
  if (sun.phase === "sunrise" || sun.phase === "pre-dawn") return "sunrise";
  if (sun.phase === "sunset" || sun.phase === "golden-hour" || sun.phase === "blue-hour")
    return "sunset";
  return sun.isDay ? "clear-day" : "clear-night";
}

/** One plate that fades in only once the file is actually playable. */
function Plate({ src, opacity }: { src: string; opacity: number }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <motion.video
      key={src}
      className="absolute inset-0 h-full w-full object-cover"
      style={{ mixBlendMode: "screen" }}
      src={src}
      autoPlay
      muted
      loop
      playsInline
      initial={{ opacity: 0 }}
      animate={{ opacity: ready ? opacity : 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.6, ease: "easeInOut" }}
      onCanPlay={() => setReady(true)}
      onError={() => setFailed(true)}
    />
  );
}

interface Props {
  snapshot: SkySnapshot | null;
  /** Off by default — turn on only once real plate files exist. */
  enabled?: boolean;
  /** How strongly the plate composits over the 3D scene (screen blend). */
  blend?: number;
}

export default function CinematicPlate({ snapshot, enabled = false, blend = 0.45 }: Props) {
  if (!enabled || !snapshot) return null;
  const key = pickPlate(snapshot);
  if (!key) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden" aria-hidden>
      <AnimatePresence mode="sync">
        <Plate key={key} src={`/cinematic/${key}.webm`} opacity={blend} />
      </AnimatePresence>
    </div>
  );
}
