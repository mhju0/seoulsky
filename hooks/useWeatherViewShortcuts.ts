"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Shared keyboard navigation for the weather experience:
 *   • A → /atmosphere
 *   • D → /diagnostics
 *   • Esc → / (cinematic home)
 *
 * One listener, reused by the home page and the weather shell, so the two
 * routes never register competing handlers. It deliberately stays inert while
 * the user is typing or holding a command modifier, and never navigates to the
 * route the user is already on.
 */

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

export function useWeatherViewShortcuts(): void {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore auto-repeat, command modifiers, and any text-entry context.
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;

      const go = (to: string) => {
        if (pathname !== to) router.push(to);
      };

      switch (e.key.toLowerCase()) {
        case "a":
          go("/atmosphere");
          break;
        case "d":
          go("/diagnostics");
          break;
        case "escape":
          go("/");
          break;
        default:
          return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname]);
}
