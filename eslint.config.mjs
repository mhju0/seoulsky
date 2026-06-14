import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // react-three-fiber drives three.js by mutating objects inside useFrame and
    // relies on the canonical lazy-ref-init pattern. Both are intentional and
    // both are flagged by the experimental React Compiler rules, which assume
    // pure-render semantics that don't hold for an imperative WebGL render loop.
    files: ["components/three/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Client-only capability detection and data fetching must run post-mount
    // (hydration safety / external-system sync); the rule over-flags this.
    files: ["hooks/**/*.{ts,tsx}", "components/cinematic/CinematicWeatherPage.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
