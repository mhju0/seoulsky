"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { plateSources, type CinematicPlateKey } from "@/lib/cinematic/plateManifest";

/**
 * The cinematic BASE plate — the distant, photoreal aerial world.
 *
 * This is Layer 1 of the hybrid stack (z-0): a full-screen muted, looping
 * <video> selected from live Seoul time + weather. The real-time three.js scene
 * is composited transparently ON TOP (precipitation, near-cloud vapor, fog,
 * lightning, live tint), so the footage is the world and three.js is the live
 * adaptation. The footage is generated offline (Higgsfield in the Claude CLI)
 * and dropped into public/cinematic/generated/ — there is no runtime Higgsfield
 * call, account, or credential anywhere in the app.
 *
 * Robustness is the whole point:
 *   • A missing/corrupt file errors the <video> → onFailed() → the page drops to
 *     the procedural scene. Never a broken box, never a black frame.
 *   • Weather/time changes crossfade over ~2.8 s with NO black flash: the new
 *     plate fades in fully on top of the still-opaque old one, which is only
 *     unmounted afterwards. At most two videos decode at once.
 *   • Reduced motion shows the plate as a static first frame (no autoplay/loop).
 *
 * Looping uses the native `loop` attribute; the clips are authored loop-friendly
 * (steady forward flight, compatible first/last framing). See
 * public/cinematic/README.md for the seamless-vs-crossfade-loop note.
 */

const CROSSFADE_S = 2.8;

interface PlateLayerProps {
  plateKey: CinematicPlateKey;
  reducedMotion: boolean;
  onReady: () => void;
  onError: (message: string) => void;
  onFormat: (type: string | null) => void;
}

/** One <video> that fades itself in only once it can actually play. */
function PlateLayer({ plateKey, reducedMotion, onReady, onError, onFormat }: PlateLayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const sources = plateSources(plateKey);

  const handleCanPlay = () => {
    if (!ready) {
      setReady(true);
      const v = ref.current;
      onFormat(v?.currentSrc?.endsWith(".webm") ? "video/webm" : v?.currentSrc ? "video/mp4" : null);
      onReady();
    }
    // Muted autoplay is permitted everywhere, but stay defensive about rejection.
    if (!reducedMotion) ref.current?.play().catch(() => {});
  };

  // No usable source (e.g. a dev-forced key with no file) or a runtime error:
  // render nothing. The parent detects the no-source case via an effect so we
  // never call setState during another component's render.
  if (failed || sources.length === 0) return null;
  return (
    <motion.video
      ref={ref}
      className="absolute inset-0 h-full w-full object-cover"
      autoPlay={!reducedMotion}
      muted
      loop={!reducedMotion}
      playsInline
      preload="metadata"
      initial={{ opacity: 0 }}
      animate={{ opacity: ready ? 1 : 0 }}
      transition={{ duration: CROSSFADE_S, ease: "easeInOut" }}
      onCanPlay={handleCanPlay}
      onError={() => {
        setFailed(true);
        onError(`video error: ${plateKey}`);
      }}
    >
      {sources.map((s) => (
        <source key={s.src} src={s.src} type={s.type} />
      ))}
    </motion.video>
  );
}

interface Layer {
  key: CinematicPlateKey;
  uid: number;
}

interface Props {
  activeKey: CinematicPlateKey;
  reducedMotion: boolean;
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
        <PlateLayer
          key={layer.uid}
          plateKey={layer.key}
          reducedMotion={reducedMotion}
          onReady={() => handleReady(layer.uid)}
          onError={() => handleError(layer.uid)}
          onFormat={onFormat ?? (() => {})}
        />
      ))}
    </div>
  );
}
