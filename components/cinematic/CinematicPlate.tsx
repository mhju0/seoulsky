"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { plateSources, type CinematicPlateKey } from "@/lib/cinematic/plateManifest";
import SeamlessVideo from "./SeamlessVideo";

/**
 * The cinematic BASE plate — the distant, photoreal aerial world.
 *
 * This is Layer 1 of the hybrid stack (z-0): a full-screen muted video selected
 * from live Seoul time + weather. The real-time three.js scene is composited
 * transparently ON TOP (precipitation, near-cloud vapor, fog, lightning, live
 * tint), so the footage is the world and three.js is the live adaptation. The
 * footage is generated offline (Higgsfield in the Claude CLI) and dropped into
 * public/cinematic/generated/ — there is no runtime Higgsfield call, account, or
 * credential anywhere in the app.
 *
 * Two independent crossfades stack here:
 *   • LOOP seams — each {@link SeamlessVideo} runs a dual-buffer crossfade at the
 *     clip boundary, so the loop never shows a hard jump (no reliance on a
 *     perfectly seamless render).
 *   • WEATHER/TIME family changes — when `activeKey` changes, the new family's
 *     layer fades in fully on top of the still-opaque outgoing one over ~2.8 s
 *     (no black flash); the old layer is unmounted only after the fade.
 *
 * Robustness is the whole point:
 *   • A missing/corrupt file → onError → onFailed() → the page drops to the
 *     procedural scene. Never a broken box, never a black frame.
 *   • Reduced motion shows the plate as a static first frame (no autoplay/loop).
 *   • Low-power / mobile tiers (`seamless={false}`) use a single native-loop
 *     video so only one decoder is active.
 */

const CROSSFADE_S = 2.8;

interface FamilyLayerProps {
  plateKey: CinematicPlateKey;
  reducedMotion: boolean;
  seamless: boolean;
  onReady: () => void;
  onError: (message: string) => void;
  onFormat: (type: string | null) => void;
}

/**
 * One weather-family layer: a {@link SeamlessVideo} (which owns its own loop
 * crossfade) wrapped in a div that fades the WHOLE family in once the video can
 * play — that is the family/time crossfade.
 */
function FamilyLayer({ plateKey, reducedMotion, seamless, onReady, onError, onFormat }: FamilyLayerProps) {
  const [ready, setReady] = useState(false);
  if (plateSources(plateKey).length === 0) return null;
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: ready ? 1 : 0 }}
      transition={{ duration: CROSSFADE_S, ease: "easeInOut" }}
    >
      <SeamlessVideo
        plateKey={plateKey}
        reducedMotion={reducedMotion}
        seamless={seamless}
        onReady={() => {
          if (!ready) setReady(true);
          onReady();
        }}
        onError={onError}
        onFormat={onFormat}
      />
    </motion.div>
  );
}

interface Layer {
  key: CinematicPlateKey;
  uid: number;
}

interface Props {
  activeKey: CinematicPlateKey;
  reducedMotion: boolean;
  /** Use the dual-buffer seamless loop (desktop/high tiers) vs. native loop. */
  seamless: boolean;
  /** First playable frame of any plate. */
  onReady?: () => void;
  /** The active plate has no usable source (file missing / codec / corrupt). */
  onFailed?: () => void;
  /** A crossfade between two plates just started. */
  onTransition?: () => void;
  /** The <source> the browser selected for the current plate. */
  onFormat?: (type: string | null) => void;
}

export default function CinematicPlate({
  activeKey,
  reducedMotion,
  seamless,
  onReady,
  onFailed,
  onTransition,
  onFormat,
}: Props) {
  const [layers, setLayers] = useState<Layer[]>(() => [{ key: activeKey, uid: 0 }]);
  const uid = useRef(0);
  const everReady = useRef(false);
  const pruneTimer = useRef<number | null>(null);

  // Push a new top layer whenever the target key changes; keep at most two
  // (the visible one + the incoming one) so we never decode more than two.
  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.key === activeKey) return prev;
      uid.current += 1;
      onTransition?.();
      return [...prev.slice(-1), { key: activeKey, uid: uid.current }];
    });
  }, [activeKey, onTransition]);

  useEffect(
    () => () => {
      if (pruneTimer.current) window.clearTimeout(pruneTimer.current);
    },
    [],
  );

  // A key with no declared source (e.g. a dev ?plate= override for an
  // ungenerated plate) can never play — report failure so the page falls back
  // to the procedural scene.
  useEffect(() => {
    if (plateSources(activeKey).length === 0) onFailed?.();
  }, [activeKey, onFailed]);

  const topUid = layers[layers.length - 1]?.uid;

  const handleReady = (layerUid: number) => {
    const first = !everReady.current;
    everReady.current = true;
    if (first) onReady?.();
    // Once the incoming (top) layer is playing, the crossfade is underway —
    // after it completes, drop everything beneath it.
    if (layerUid === topUid && layers.length > 1) {
      if (pruneTimer.current) window.clearTimeout(pruneTimer.current);
      pruneTimer.current = window.setTimeout(() => {
        setLayers((prev) => prev.slice(-1));
      }, CROSSFADE_S * 1000);
    }
  };

  const handleError = (layerUid: number) => {
    setLayers((prev) => prev.filter((l) => l.uid !== layerUid));
    // Nothing good has ever shown → tell the page to fall back to procedural.
    if (!everReady.current) onFailed?.();
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black" aria-hidden>
      {layers.map((layer) => (
        <FamilyLayer
          key={layer.uid}
          plateKey={layer.key}
          reducedMotion={reducedMotion}
          seamless={seamless}
          onReady={() => handleReady(layer.uid)}
          onError={() => handleError(layer.uid)}
          onFormat={onFormat ?? (() => {})}
        />
      ))}
    </div>
  );
}
