import nextConfig from "eslint-config-next";

const eslintConfig = [
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
    // These React Compiler advisories reject established external-data loading
    // effects and third-party hooks without identifying runtime defects. Keep
    // them disabled until those components are migrated to compiler-safe data
    // primitives. The zero-warning CI gate still enforces every enabled rule.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/static-components": "off",
      "react-hooks/incompatible-library": "off",
      // Joey renders tenant-provided and generated media from dynamic origins;
      // next/image cannot safely enumerate or optimize those URLs.
      "@next/next/no-img-element": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
