import { MetricLabel } from "../EtchedType";

/**
 * The quiet etched caption that opens each descent band: an altitude index, a
 * hairline tick, and the band name (EN · KO). No chrome — just type.
 */
export default function BandHeading({ index, en, ko }: { index: string; en: string; ko: string }) {
  return (
    <div className="mb-10 flex items-center gap-4">
      <span className="font-mono text-[11px] tabular-nums tracking-[0.3em] text-white/35">{index}</span>
      <span aria-hidden className="h-px w-12 bg-white/20" />
      <MetricLabel tone="muted">
        {en} · {ko}
      </MetricLabel>
    </div>
  );
}
