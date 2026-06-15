"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";

/**
 * Scroll-motion infrastructure for The Descent bands.
 *
 * IMPORTANT: none of this drives the atmospheric field. The field reads scroll
 * from its OWN passive ref inside its rAF loop (AtmosphericFieldBackground). These
 * helpers only animate the readable foreground, and they do it with Framer Motion
 * MotionValues + IntersectionObserver (`whileInView`) — never React state — so the
 * page never re-renders per scroll frame.
 */

/**
 * Fade + translate a band's content in as it enters the viewport (once). Under
 * prefers-reduced-motion it renders in its final, fully-visible state with no
 * animation, so information is never gated behind motion.
 */
export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  y = 28,
  amount = 0.3,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  amount?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.85, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Light parallax: shift the wrapped content vertically at a slightly different
 * rate than the page as it passes through the viewport — a depth cue between the
 * foreground type and the fixed field behind it. Pure MotionValue math; held
 * still under reduced motion.
 */
export function Parallax({
  children,
  className = "",
  distance = 60,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}

/**
 * One descent band: a full-height (by default) scroll section with the shared
 * reading gutter. `id` lets a band be a scroll anchor (e.g. #ground).
 */
export function Band({
  id,
  children,
  className = "",
  fullHeight = true,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  fullHeight?: boolean;
}) {
  return (
    <section
      id={id}
      className={`relative flex w-full scroll-mt-0 flex-col justify-center px-[clamp(1.25rem,5vw,4.5rem)] py-[clamp(3rem,12vh,8rem)] ${
        fullHeight ? "min-h-svh" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}
