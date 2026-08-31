import nextConfig from "eslint-config-next";

export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".eve/**",
      ".output/**",
      "repos/**",
      "repomix.xml",
      "src/lib/db/migrations/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...nextConfig,
  {
    // New React-Compiler-era react-hooks stylistic rules produce a large
    // amount of churn across pre-existing code. Treat as warnings rather than
    // errors so `npm run lint` stays green while teams migrate incrementally.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react/no-unescaped-entities": "warn",
      "@next/next/no-img-element": "warn",
    },
  },
];
