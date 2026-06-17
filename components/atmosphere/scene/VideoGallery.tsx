"use client";

import { useEffect, useMemo, useRef } from "react";
import type { WeatherCondition } from "@/lib/types";
import {
  pickNextClip,
  selectGalleryPool,
  type LocationClip,
  type LocationManifest,
} from "@/lib/cinematic/locationGallery";

/**
 * The condition-coupled shuffling VIDEO gallery — layer (b) of the /sky scene.
 *
 * It shuffles the Seoul-landmark clips whose condition matches the LIVE weather
 * (broadening to the whole library when too few match), crossfading clip-to-clip
 * every ~6–10s. The crossfade is ALWAYS video-to-video: the next clip is
 * preloaded and decoded into a hidden second buffer and started playing before
 * the opacity ramp begins, so a frame is never frozen and there is never a still
 * placeholder. Exactly two <video> elements exist, so at most two videos are
 * decoded at once.
 *
 * Everything below the React boundary is imperative (refs + rAF + timers) so the
 * page never re-renders per animation frame; React only re-runs the cheap pool
 * memo when the weather or time-of-day changes. Playback + shuffle pause when the
 * tab is hidden (`paused`). Under `reducedMotion` the shuffle stops entirely and
 * one calm clip loops, with all data still readable.
 *
 * `onCoverageChange(true)` fires once a clip is actually painting at full
 * opacity; the parent uses it to pause the procedural field that sits behind as
 * the never-blank fallback. If every clip fails to load it stays false and the
 * field keeps showing — never a blank frame.
 */

const HOLD_MIN_MS = 6000;
const HOLD_MAX_MS = 10000;
const FADE_MS = 1500;
/** Don't let a stalled decode hang the shuffle forever. */
const READY_TIMEOUT_MS = 4000;

const smoothstep = (k: number) => k * k * (3 - 2 * k);
const clipSrc = (clip: LocationClip) => clip.webm ?? clip.mp4;

/** Prefer a serene clip for the reduced-motion still-loop (no storm/rain churn). */
function pickCalmClip(pool: readonly LocationClip[]): LocationClip | null {
  const order: LocationClip["condition"][] = ["clear", "partly-cloudy", "overcast", "fog", "snow", "rain"];
  for (const cond of order) {
    const found = pool.find((c) => c.condition === cond);
    if (found) return found;
  }
  return pool[0] ?? null;
}

export interface VideoGalleryProps {
  manifest: LocationManifest;
  condition: WeatherCondition;
  isDay: boolean;
  reducedMotion: boolean;
  /** Tab hidden — pause playback + shuffle. */
  paused: boolean;
  onCoverageChange: (covering: boolean) => void;
}

export default function VideoGallery({
  manifest,
  condition,
  isDay,
  reducedMotion,
  paused,
  onCoverageChange,
}: VideoGalleryProps) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);

  // The live shuffle pool, recomputed only when weather/time-of-day change and
  // mirrored into a ref the imperative loop reads (so the loop never restarts on
  // a weather refresh — it just draws from the fresh pool on its next pick).
  const pool = useMemo(
    () => selectGalleryPool(manifest.clips, condition, isDay),
    [manifest, condition, isDay],
  );
  const poolRef = useRef(pool);
  poolRef.current = pool;

  // Keep callback fresh without restarting the controller.
  const onCoverageRef = useRef(onCoverageChange);
  onCoverageRef.current = onCoverageChange;

  // Live tab-hidden flag, read by the controller so a rebuild (e.g. a
  // reduced-motion toggle) never starts playback while the tab is hidden.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Suspend/resume handle for the visibility effect, set up by the controller.
  const controlRef = useRef<{ suspend: () => void; resume: () => void } | null>(null);

  // --- The imperative shuffle controller. Rebuilt only when the motion MODE
  //     changes (reduced ↔ full); weather/pool changes flow in via refs. -------
  useEffect(() => {
    const els = [videoARef.current, videoBRef.current];
    const a = els[0];
    const b = els[1];
    if (!a || !b) return;

    for (const el of [a, b]) {
      el.muted = true; // belt-and-suspenders for autoplay (React's prop is flaky)
      el.loop = true;
      el.style.opacity = "0";
    }

    let front = 0; // index of the visible buffer
    const bufClipId: (string | null)[] = [null, null];
    let currentId: string | null = null;
    let raf = 0;
    let holdTimer = 0;
    let disposed = false;
    // Start suspended if the tab is already hidden, so a controller rebuilt
    // while hidden (e.g. a prefers-reduced-motion flip) doesn't resume playback
    // in the background until the tab is actually shown again.
    let suspended = pausedRef.current;
    let started = false;
    let covering = false;

    const setCovering = (v: boolean) => {
      if (v === covering) return;
      covering = v;
      onCoverageRef.current(v);
    };

    const playSafe = (el: HTMLVideoElement) => {
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };

    const loadBuf = (i: number, clip: LocationClip) => {
      const el = els[i]!;
      el.src = clipSrc(clip);
      el.load();
      el.playbackRate = clip.rate ?? 0.7;
      bufClipId[i] = clip.id;
    };

    // Resolve when the buffer can play forward (decoded), or on a best-effort
    // timeout; route hard load errors to `onError`.
    const whenReady = (el: HTMLVideoElement, onOk: () => void, onError: () => void) => {
      if (el.readyState >= 3) {
        onOk();
        return;
      }
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled || disposed) return;
        settled = true;
        window.clearTimeout(to);
        el.removeEventListener("canplay", ok);
        el.removeEventListener("error", err);
        fn();
      };
      const ok = () => finish(onOk);
      const err = () => finish(onError);
      const to = window.setTimeout(ok, READY_TIMEOUT_MS); // proceed best-effort
      el.addEventListener("canplay", ok, { once: true });
      el.addEventListener("error", err, { once: true });
    };

    const ramp = (apply: (k: number) => void, done?: () => void) => {
      const t0 = performance.now();
      const step = () => {
        if (disposed) return;
        const k = Math.min(1, (performance.now() - t0) / FADE_MS);
        apply(smoothstep(k));
        if (k < 1) raf = requestAnimationFrame(step);
        else {
          raf = 0;
          done?.();
        }
      };
      raf = requestAnimationFrame(step);
    };

    const scheduleHold = () => {
      if (disposed || suspended || reducedMotion) return;
      if (poolRef.current.length <= 1) return; // nothing to shuffle to
      window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(crossfade, HOLD_MIN_MS + Math.random() * (HOLD_MAX_MS - HOLD_MIN_MS));
    };

    // Preload (and decode) the next clip into the hidden back buffer so it is
    // ready well before the crossfade.
    const preloadNext = () => {
      const next = pickNextClip(poolRef.current, currentId);
      if (!next) return;
      const back = 1 - front;
      els[back]!.style.opacity = "0";
      loadBuf(back, next);
    };

    const crossfade = (retries = poolRef.current.length) => {
      if (disposed || suspended) return;
      const livePool = poolRef.current;
      if (livePool.length <= 1) {
        scheduleHold();
        return;
      }
      const back = 1 - front;
      // If the weather changed, the preloaded clip may no longer be in the pool —
      // re-pick from the current pool.
      if (!livePool.some((c) => c.id === bufClipId[back])) {
        const target = pickNextClip(livePool, currentId);
        if (target) loadBuf(back, target);
      }
      const backEl = els[back]!;
      whenReady(
        backEl,
        () => {
          if (disposed || suspended) return;
          playSafe(backEl);
          const frontEl = els[front]!;
          ramp(
            (k) => {
              backEl.style.opacity = String(k);
              frontEl.style.opacity = String(1 - k);
            },
            () => {
              frontEl.pause(); // free the now-hidden buffer's playback
              front = back;
              currentId = bufClipId[front];
              preloadNext();
              scheduleHold();
            },
          );
        },
        () => {
          // This clip failed — try another, then eventually just keep the
          // current clip looping (still live) and retry on the next hold.
          if (retries > 0) {
            const alt = pickNextClip(poolRef.current, currentId);
            if (alt) loadBuf(back, alt);
            window.setTimeout(() => crossfade(retries - 1), 200);
          } else {
            scheduleHold();
          }
        },
      );
    };

    // Initial clip: walk the pool until one loads; if all fail, leave covering
    // false so the procedural field behind keeps showing (never blank).
    const startFrom = (candidates: LocationClip[]) => {
      const clip = candidates[0];
      if (!clip) {
        setCovering(false);
        return;
      }
      currentId = clip.id;
      const frontEl = els[front]!;
      frontEl.style.opacity = "0";
      loadBuf(front, clip);
      whenReady(
        frontEl,
        () => {
          if (disposed || suspended) return;
          playSafe(frontEl);
          ramp(
            (k) => {
              frontEl.style.opacity = String(k);
            },
            () => setCovering(true),
          );
          // Under reduced motion the gallery never shuffles, so don't decode a
          // second clip into the hidden buffer that can never be shown.
          if (!reducedMotion) preloadNext();
          scheduleHold();
        },
        () => startFrom(candidates.slice(1)),
      );
    };

    // The first paint of the gallery. Deferred until the tab is visible so a
    // controller built while hidden never decodes/plays in the background.
    const begin = () => {
      if (started || disposed) return;
      started = true;
      if (reducedMotion) {
        const calm = pickCalmClip(poolRef.current);
        startFrom(calm ? [calm] : []);
      } else {
        const first = pickNextClip(poolRef.current, null);
        startFrom(first ? [first] : []);
      }
    };

    controlRef.current = {
      suspend: () => {
        suspended = true;
        window.clearTimeout(holdTimer);
        a.pause();
        b.pause();
      },
      resume: () => {
        if (!suspended && started) return;
        suspended = false;
        // First time visible: do the initial paint now instead of on build.
        if (!started) {
          begin();
          return;
        }
        playSafe(els[front]!);
        scheduleHold();
      },
    };

    // Only paint immediately when visible; otherwise the visibility effect's
    // resume() kicks off the first paint once the tab is shown.
    if (!suspended) begin();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(holdTimer);
      controlRef.current = null;
      for (const el of [a, b]) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    };
  }, [reducedMotion]);

  // Pause/resume on tab visibility without rebuilding the controller.
  useEffect(() => {
    const c = controlRef.current;
    if (!c) return;
    if (paused) c.suspend();
    else c.resume();
  }, [paused]);

  const pushIn = reducedMotion ? "" : "scene-pushin";

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#04060d]">
      <video
        ref={videoARef}
        className={`absolute inset-0 h-full w-full object-cover ${pushIn}`}
        style={{ opacity: 0 }}
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-hidden
      />
      <video
        ref={videoBRef}
        className={`absolute inset-0 h-full w-full object-cover ${pushIn}`}
        style={{ opacity: 0 }}
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-hidden
      />
    </div>
  );
}
