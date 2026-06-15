"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Shared keyboard navigation for the weather experience. Since /atmosphere and
 * /diagnostics merged into one Descent page, the keys mean "move through the
 * descent", not "switch routes":
 *
 *   • A → top of the atmosphere (the title hero)
 *   • D → the ground-station band (#ground)
 *   • Esc → / (cinematic home)
 *
 * On the merged page these are smooth in-page scrolls; from anywhere else (the
 * cinematic home `/`) they navigate into /atmosphere at the right depth, so the
 * old muscle memory still works without any cross-route /diagnostics jump.
 *
 * One listener, reused by the home page and the weather shell, so the two routes
 * never register competing handlers. It stays inert while the user is typing or
 * holding a command modifier, and never navigates to the route they are on.
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
    // Read the motion preference live (not cached) so toggling it mid-session
    // takes effect immediately: smooth normally, instant under reduced-motion.
    const scrollBehavior = (): ScrollBehavior =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";

    const toTop = () => window.scrollTo({ top: 0, behavior: scrollBehavior() });
    const toGround = () =>
      document.getElementById("ground")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });

    const onKey = (e: KeyboardEvent) => {
      // Ignore auto-repeat, command modifiers, and any text-entry context.
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;

      const onDescent = pathname === "/atmosphere";

      switch (e.key.toLowerCase()) {
        case "a":
          if (onDescent) toTop();
          else router.push("/atmosphere");
          break;
        case "d":
          if (onDescent) toGround();
          else router.push("/atmosphere#ground");
          break;
        case "escape":
          if (pathname !== "/") router.push("/");
          break;
        default:
          return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname]);
}
