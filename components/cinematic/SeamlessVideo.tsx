"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { plateSources, type CinematicPlateKey } from "@/lib/cinematic/plateManifest";

/**
 * One weather plate, rendered as a SEAMLESS loop.
 *
 * The native `loop` attribute jumps straight from the last frame to frame 0 — on
 * AI-generated footage whose first/last frames don't perfectly match, that shows
 * as a visible seam/jump. Instead we keep TWO <video> elements playing the SAME
 * clip and crossfade between them: a moment before the visible video ends, the
 * idle buffer restarts from frame 0 and fades in over ~1.6 s while the front
 * fades out; then the two swap roles. There is never a black frame and never a
 * hard cut, even when the clip itself isn't a perfect loop.
 *
 * Everything driving the fade lives in refs + a single rAF loop — React never
 * re-renders per playback frame; opacities are written straight to the DOM nodes.
 *
 * Degradation:
 *   • `seamless={false}` (low-power / mobile tier) → ONE native-`loop` <video>,
 *     so only a single decoder is ever active.
 *   • `reducedMotion` → ONE static first frame (no autoplay, no loop).
 *
 * The video is muted + playsInline (autoplay-safe), pauses while the tab is
 * hidden, and resumes on return. A missing/broken source reports via onError so
 * the page can fall back to the procedural scene.
 */

const FADE_S = 1.6; // crossfade length at the loop boundary (within the 1.2–2 s spec)
const TAIL_GUARD = 0.06; // stay clear of the very last frame

interface Props {
  plateKey: CinematicPlateKey;
  reducedMotion: boolean;
  /** Dual-buffer crossfade loop (true) vs. single native-loop video (false). */
  seamless: boolean;
  /** First playable frame. */
  onReady: () => void;
  /** No usable source / decode error. */
  onError: (message: string) => void;
  /** The <source> the browser actually selected. */
  onFormat: (type: string | null) => void;
}

function pickFormat(v: HTMLVideoElement | null): string | null {
  if (!v?.currentSrc) return null;
  return v.currentSrc.endsWith(".webm") ? "video/webm" : "video/mp4";
}

export default function SeamlessVideo({
  plateKey,
  reducedMotion,
  seamless,
  onReady,
  onError,
  onFormat,
}: Props) {
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const readyFired = useRef(false);
  const [failed, setFailed] = useState(false);

  // Stable across re-renders (the component is keyed by layer uid upstream).
  const sources = useMemo(() => plateSources(plateKey), [plateKey]);
  const dual = seamless && !reducedMotion && sources.length > 0;

  const fireReady = (v: HTMLVideoElement | null) => {
    if (readyFired.current) return;
    readyFired.current = true;
    onFormat(pickFormat(v));
    onReady();
  };

  // --- dual-buffer crossfade loop ------------------------------------------
  useEffect(() => {
    if (!dual) return;
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;

    let raf = 0;
    let front = a;
    let back = b;
    let started = false;
    let fading = false;
    let fadeStart = 0;
    let disposed = false;
    let nativeFallback = false; // set if the back buffer can't be used

    a.style.opacity = "1";
    b.style.opacity = "0";

    const safePlay = (v: HTMLVideoElement) => v.play().catch(() => {});

    const begin = () => {
      if (started) return;
      const dur = front.duration;
      if (!Number.isFinite(dur) || dur <= 0) return; // wait for metadata
      started = true;
      // Small randomized initial offset so repeated route visits don't always
      // start on the same frame. Kept clear of the loop-boundary fade.
      const maxOff = Math.min(dur * 0.4, 4) - FADE_S;
      if (maxOff > 0.3) {
        try {
          front.currentTime = Math.random() * maxOff;
        } catch {
          /* seeking before seekable — ignore, plays from 0 */
        }
      }
      safePlay(front);
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (disposed) return;
      if (!started) {
        begin();
        return;
      }
      if (nativeFallback) return; // native loop handles it
      const dur = front.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;

      if (!fading) {
        if (dur - front.currentTime <= FADE_S + TAIL_GUARD) {
          fading = true;
          fadeStart = performance.now();
          try {
            back.currentTime = 0;
          } catch {
            /* ignore */
          }
          safePlay(back);
        }
        return;
      }

      const k = Math.min(1, (performance.now() - fadeStart) / (FADE_S * 1000));
      front.style.opacity = String(1 - k);
      back.style.opacity = String(k);
      if (k >= 1) {
        front.pause();
        try {
          front.currentTime = 0;
        } catch {
          /* ignore */
        }
        front.style.opacity = "0";
        back.style.opacity = "1";
        const swap = front;
        front = back;
        back = swap;
        fading = false;
      }
    };

    // If the back buffer can't play, fall back to a native loop on the front so
    // the experience continues (a possible seam, but never a black frame).
    const onBackError = () => {
      nativeFallback = true;
      front.loop = true;
      back.style.opacity = "0";
    };
    b.addEventListener("error", onBackError);

    raf = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      b.removeEventListener("error", onBackError);
    };
  }, [dual]);

  // --- pause while hidden, resume the visible buffer on return --------------
  useEffect(() => {
    if (reducedMotion) return;
    const onVis = () => {
      const vids = [aRef.current, bRef.current].filter(Boolean) as HTMLVideoElement[];
      if (document.hidden) {
        vids.forEach((v) => v.pause());
      } else {
        // Resume anything currently visible (front, or both mid-crossfade).
        vids.forEach((v) => {
          if (v.style.opacity !== "0") v.play().catch(() => {});
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reducedMotion]);

  if (failed || sources.length === 0) return null;

  const sourceTags = sources.map((s) => <source key={s.src} src={s.src} type={s.type} />);

  const handleError = (msg: string) => {
    setFailed(true);
    onError(msg);
  };

  // Reduced motion: a single static first frame, no autoplay/loop.
  if (reducedMotion) {
    return (
      <video
        ref={aRef}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
        onLoadedData={(e) => {
          fireReady(e.currentTarget);
          e.currentTarget.pause();
        }}
        onError={() => handleError(`video error: ${plateKey}`)}
      >
        {sourceTags}
      </video>
    );
  }

  // Low-power tier: one native-loop video (single decoder).
  if (!seamless) {
    return (
      <video
        ref={aRef}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          const dur = v.duration;
          if (Number.isFinite(dur) && dur > FADE_S * 2) v.currentTime = Math.random() * (dur * 0.4);
        }}
        onCanPlay={(e) => {
          fireReady(e.currentTarget);
          e.currentTarget.play().catch(() => {});
        }}
        onError={() => handleError(`video error: ${plateKey}`)}
      >
        {sourceTags}
      </video>
    );
  }

  // Seamless dual-buffer: front (A) drives readiness; the loop effect runs both.
  return (
    <>
      <video
        ref={aRef}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        playsInline
        preload="auto"
        onCanPlay={(e) => fireReady(e.currentTarget)}
        onError={() => handleError(`video error: ${plateKey}`)}
      >
        {sourceTags}
      </video>
      <video
        ref={bRef}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ opacity: 0 }}
        muted
        playsInline
        preload="auto"
      >
        {sourceTags}
      </video>
    </>
  );
}
