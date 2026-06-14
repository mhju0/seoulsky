import type {
  NormalizedAirQuality,
  NormalizedWarning,
  ProviderAvailability,
  RadarSummary,
  WeatherProviderStatus,
} from "@/lib/types";

/**
 * /diagnostics environment panel: official warnings, fused air quality (with
 * provenance + freshness), RainViewer radar metadata (with attribution), and the
 * per-source status of the optional environmental providers. Renders only plain
 * weather/config objects — never any Three.js / scene state.
 */

const BAND: Record<1 | 2 | 3 | 4, { label: string; cls: string }> = {
  1: { label: "좋음", cls: "text-emerald-300" },
  2: { label: "보통", cls: "text-sky-300" },
  3: { label: "나쁨", cls: "text-amber-300" },
  4: { label: "매우나쁨", cls: "text-rose-300" },
};

const DOT: Record<ProviderAvailability, string> = {
  ok: "bg-emerald-400",
  "needs-config": "bg-amber-400",
  error: "bg-rose-400",
  unavailable: "bg-slate-500",
};

function kstTime(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="text-sm tabular-nums text-slate-200">{value}</span>
    </div>
  );
}

export default function EnvironmentPanel({
  air,
  radar,
  warnings,
  statuses,
}: {
  air: NormalizedAirQuality | null;
  radar: RadarSummary | null;
  warnings: NormalizedWarning[];
  statuses: WeatherProviderStatus[];
}) {
  const band = air?.band ? BAND[air.band] : null;
  const num = (n: number | null, unit = "") => (n == null ? "—" : `${n}${unit}`);

  return (
    <div className="flex flex-col gap-4">
      {warnings.length > 0 && (
        <div className="glass rounded-2xl p-4">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">기상특보 (KMA)</p>
          <div className="flex flex-wrap gap-2">
            {warnings.map((w, i) => (
              <span
                key={`${w.type}-${w.level}-${i}`}
                className={`rounded-full border px-3 py-1 text-xs ${
                  w.level === "경보"
                    ? "border-rose-400/40 bg-rose-500/10 text-rose-200"
                    : "border-amber-300/40 bg-amber-400/10 text-amber-200"
                }`}
              >
                {w.headline}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Air quality */}
        <div className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">대기질</p>
            {band && <span className={`text-sm font-semibold ${band.cls}`}>{band.label}</span>}
          </div>
          {air ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Metric label="PM2.5" value={num(air.pm25, " ㎍/㎥")} />
                <Metric label="PM10" value={num(air.pm10, " ㎍/㎥")} />
                <Metric label="오존" value={num(air.ozone, " ㎍/㎥")} />
                <Metric label="이산화질소" value={num(air.no2, " ㎍/㎥")} />
                <Metric label="먼지(dust)" value={num(air.dust, " ㎍/㎥")} />
                <Metric label="UV" value={num(air.uvIndex)} />
              </div>
              <p className="mt-3 text-[10px] text-slate-500">
                {air.source === "airkorea" ? `AirKorea · ${air.station ?? "서울"}` : "Open-Meteo 대기질"}
                {" · "}
                {kstTime(air.observedAt)}
                {air.stale ? " · 지연" : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">대기질 데이터를 사용할 수 없습니다</p>
          )}
        </div>

        {/* Radar */}
        <div className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">강수 레이더</p>
            {radar?.available && (
              <span className="text-[10px] text-slate-500">© {radar.attribution}</span>
            )}
          </div>
          {radar?.available ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Metric
                  label="관측 프레임"
                  value={String(radar.frames.filter((f) => !f.nowcast).length)}
                />
                <Metric label="최근 관측" value={kstTime(radar.latestObservedAt)} />
                <Metric label="서울 부근 강수" value={radar.precipNearby ? "있음" : "없음"} />
              </div>
              <p className="mt-3 text-[10px] text-slate-500">
                {radar.approaching && radar.fromDirection
                  ? `${radar.fromDirection}쪽에서 비구름 접근 중`
                  : "접근하는 비구름 신호 없음"}
                {radar.stale ? " · 지연" : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">레이더 데이터를 사용할 수 없습니다</p>
          )}
        </div>
      </div>

      {/* Per-source environmental status */}
      <div className="glass rounded-2xl p-4">
        <p className="mb-3 text-[10px] uppercase tracking-wider text-slate-500">환경 소스 상태</p>
        <ul className="flex flex-col gap-2">
          {statuses.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.availability]}`} />
              <span className="text-slate-200">{s.name}</span>
              <span className="ml-auto text-xs text-slate-500">
                {s.message}
                {s.missingEnvVars && s.missingEnvVars.length > 0
                  ? ` · ${s.missingEnvVars.join(", ")}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
