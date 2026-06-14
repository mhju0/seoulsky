/**
 * Hand-drawn Seoul skyline silhouette — Lotte-Tower-style spire on the left,
 * Namsan hill and N Seoul Tower on the right. Pure SVG, no assets.
 */

interface Props {
  className?: string;
  /** Blinking aviation lights — disable on background copies. */
  lights?: boolean;
}

export default function SeoulSkyline({ className, lights = true }: Props) {
  return (
    <svg className={className} viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden>
      <path
        fill="currentColor"
        d="M0,320 L0,236 L36,236 L36,218 L66,218 L66,244 L110,244 L110,200 L148,200 L148,230 L194,230 L194,178 L234,178 L234,228 L272,228 L290,62 L302,54 L314,62 L332,228 L368,228 L368,196 L404,196 L404,240 L448,240 L448,206 L488,206 L488,232 L532,232 L532,184 L576,184 L576,226 L620,226 L620,210 L664,210 L664,238 L708,238 L708,192 L748,192 L748,224 L792,224 L792,206 L836,206 L836,242 L880,242 C920,242 950,224 990,212 C1030,200 1052,197 1066,197 L1102,197 C1140,200 1180,216 1212,228 L1240,228 L1240,206 L1284,206 L1284,236 L1330,236 L1330,214 L1376,214 L1376,244 L1440,244 L1440,320 Z
           M1080,200 L1080,108 L1088,108 L1088,200 Z
           M1070,124 L1098,124 L1098,108 L1070,108 Z
           M1082.5,108 L1084,58 L1085.5,108 Z"
      />
      {lights && (
        <>
          <circle cx="1084" cy="56" r="2.4" fill="#f87171">
            <animate
              attributeName="opacity"
              values="1;0.15;1"
              dur="2.6s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="302" cy="52" r="2" fill="#f87171">
            <animate
              attributeName="opacity"
              values="0.15;1;0.15"
              dur="2.6s"
              repeatCount="indefinite"
            />
          </circle>
        </>
      )}
    </svg>
  );
}
