// Minimal, high-signal lint: catch names used without being defined or
// imported (these crash a page at runtime). Style rules are deliberately off;
// tighten gradually. Run: npm run lint
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "functions/**", "functions-identity/**", "_recovered-platform/**", "_vendor/**", "public/**", "scripts/**", "tests/**"],
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "no-undef": "error",
      // Registered so existing eslint-disable comments resolve; enable later.
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
];
