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
  faint: "text-white/70",
};

/** A quiet Korean instrument caption above a reading. */
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
      className={`block font-sans text-[12px] font-medium tracking-[0.12em] ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

type ValueSize = "sm" | "md" | "tile" | "lg" | "xl" | "hero";

const VALUE_SIZE: Record<ValueSize, string> = {
  sm: "text-2xl",
  md: "text-[clamp(2.4rem,4.4vw,3.5rem)]",
  // Instrument-tile primary reading — substantially larger than `md`, sized to
  // fill the card's left column at the 3-up desktop grid while still settling on
  // mobile (2-up). clamp() keeps it fluid; the floor stays readable at 2-up.
  tile: "text-[clamp(3rem,5.2vw,4.5rem)]",
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
  unitFull = false,
  size = "md",
  tone = "bright",
  className = "",
}: {
  children: ReactNode;
  unit?: ReactNode;
  /** When true, the unit renders at full adaptive ink strength (text-white) instead of the default text-white/65. */
  unitFull?: boolean;
  size?: ValueSize;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`etched-shadow inline-flex items-baseline font-sans font-light tabular-nums leading-[0.85] ${VALUE_SIZE[size]} ${TONE[tone]} ${className}`}
    >
      {children}
      {unit != null && (
        // The degree symbol reads as a temperature superscript, so it rides the
        // cap height (align-self:start) instead of the baseline like scalar units
        // (m/s, %, µg/m³), which stay baseline-aligned where they read correctly.
        <span
          className={`font-light tracking-[0.12em] ${
            unit === "°" ? "ml-[0.04em] self-start text-[0.42em] leading-none" : "ml-[0.12em] text-[0.34em]"
          } ${unitFull ? "text-white" : "text-white/65"}`}
        >
          {unit}
        </span>
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
      className={`etched-shadow sky-display max-w-[27ch] break-keep text-[clamp(1.2rem,2.2vw,1.65rem)] leading-[1.75] text-white ${className}`}
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
