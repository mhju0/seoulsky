"use client";

import { useEffect, useState } from "react";

/**
 * A live clock that ticks once per second and re-syncs whenever the tab
 * becomes visible or the window regains focus (so it self-corrects after the
 * laptop sleeps). Returns `null` on the server and the first client render to
 * avoid a hydration mismatch — callers render a placeholder until it's set.
 *
 * The Date itself is an absolute instant; formatting into Seoul wall-time is
 * the caller's job (see lib/format.ts), so this stays timezone-agnostic.
 */
export function useSeoulClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    const resync = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, []);

  return now;
}
