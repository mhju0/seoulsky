import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The Atmospheric Color Field is a raw WebGL render loop (a single fullscreen
    // shader driven by mutable refs). The imperative pattern — reading and writing
    // refs each frame, never triggering React renders — is intentional but flagged
    // by the experimental React Compiler rules, which assume pure-render semantics.
    files: ["components/three/**/*.{ts,tsx}", "components/atmosphere/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Client-only capability detection and data fetching must run post-mount
    // (hydration safety / external-system sync); the rule over-flags this.
    files: ["hooks/**/*.{ts,tsx}"],
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
