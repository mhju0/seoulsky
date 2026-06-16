import type { ReactNode } from "react";

/**
 * Etched-instrument typography primitives for The Descent. Pure presentational —
 * no data, no state, no fetching, and crucially NO card chrome (no panels, no
 * borders, no glass). The whole band system reads as type etched over the living
 * field: small-caps mono labels, large light-weight numerals, hairline rules and
 * the Korean poetic line. Compose these; never wrap a card around them.
 */

type Tone = "bright" | "muted" | "faint";

const TONE: Record<Tone, string> = {
  bright: "text-white",
  muted: "text-white/80",
  faint: "text-white/55",
};

/** A small-caps mono label — the etched instrument caption above a reading. */
export function MetricLabel({
  children,
  tone = "faint",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`block font-mono text-[10px] uppercase tracking-[0.34em] [font-variant:small-caps] ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

type ValueSize = "sm" | "md" | "lg" | "xl" | "hero";

const VALUE_SIZE: Record<ValueSize, string> = {
  sm: "text-2xl",
  md: "text-[clamp(2rem,4vw,3rem)]",
  lg: "text-[clamp(3rem,7vw,5.5rem)]",
  xl: "text-[clamp(4rem,10vw,8rem)]",
  hero: "text-[clamp(5.5rem,15vw,12rem)]",
};

/**
 * A large, light-weight numeral (or short string) with an optional small unit
 * that rides the baseline — the signature "28°" treatment, reusable at any size.
 */
export function Value({
  children,
  unit,
  size = "md",
  tone = "bright",
  className = "",
}: {
  children: ReactNode;
  unit?: ReactNode;
  size?: ValueSize;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-baseline font-sans font-light tabular-nums leading-[0.85] [text-shadow:0_2px_24px_rgba(0,0,0,0.45)] ${VALUE_SIZE[size]} ${TONE[tone]} ${className}`}
    >
      {children}
      {unit != null && (
        <span className="ml-[0.12em] text-[0.34em] font-light tracking-[0.12em] text-white/65">{unit}</span>
      )}
    </span>
  );
}

/**
 * A hairline rule — a horizontal etched line (soft gradient, fading at the ends)
 * or a thin vertical divider when `vertical`. Never a heavy border.
 */
export function HairlineRule({
  vertical = false,
  className = "",
}: {
  vertical?: boolean;
  className?: string;
}) {
  if (vertical) {
    return <span aria-hidden className={`inline-block w-px self-stretch bg-white/15 ${className}`} />;
  }
  return (
    <hr
      aria-hidden
      className={`h-px w-full border-0 bg-gradient-to-r from-transparent via-white/20 to-transparent ${className}`}
    />
  );
}

/** The Korean poetic line — light, airy, generously led, comfortable to read. */
export function PoeticLine({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`max-w-[36ch] font-sans text-xl font-light leading-relaxed tracking-wide text-white/85 [text-shadow:0_1px_16px_rgba(0,0,0,0.5)] ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * A label-over-value reading — the most common etched unit in the bands. Pure
 * composition of {@link MetricLabel} + {@link Value} with an optional sub-caption;
 * no chrome. Values already degrade to "—" upstream, so pass a ready string.
 */
export function Metric({
  label,
  value,
  unit,
  sub,
  size = "md",
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  size?: ValueSize;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <MetricLabel>{label}</MetricLabel>
      <Value size={size} unit={unit}>
        {value}
      </Value>
      {sub != null && (
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/55">{sub}</span>
      )}
    </div>
  );
}
