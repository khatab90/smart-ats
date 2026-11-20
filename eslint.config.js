import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "android", "coverage", "node_modules", "src/data/database.types.ts"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    // Architecture boundary: only src/api talks to Supabase.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/api/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              message: "Use the typed functions in src/api instead of calling Supabase directly.",
              allowTypeImports: true,
            },
          ],
          patterns: [
            { group: ["**/api/client"], message: "Import a domain module from src/api, not the raw client." },
          ],
        },
      ],
    },
  },
  {
    // Architecture boundary: only src/platform talks to the native shell.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/platform/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@capacitor/*"], message: "Use src/platform/native instead of Capacitor directly." }] },
      ],
    },
  },
  {
    // Architecture boundary: domain/ and lib/ are pure (no React, no I/O,
    // nothing from the layers above them). See docs/ARCHITECTURE.md.
    files: ["src/domain/**/*.ts", "src/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "react", message: "domain/ and lib/ are pure: put React code in store/ or hooks/." }],
          patterns: [
            { group: ["@capacitor/*"], message: "Use src/platform/native instead of Capacitor directly." },
            {
              group: ["**/api/**", "**/store/**", "**/hooks/**", "**/components/**", "**/features/**", "**/screens/**", "**/platform/**"],
              message: "domain/ and lib/ may import only each other, data/ and i18n/.",
            },
          ],
        },
      ],
    },
  },
  {
    // Architecture boundary: design-system primitives know nothing about the app.
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@capacitor/*"], message: "Use src/platform/native instead of Capacitor directly." },
            {
              group: ["**/api/**", "**/store/**", "**/hooks/**", "**/features/**", "**/screens/**"],
              message: "components/ui is app-agnostic: pass data in through props.",
            },
          ],
        },
      ],
    },
  },
  {
    // Architecture boundary: features are parts of screens, never the reverse.
    files: ["src/features/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@capacitor/*"], message: "Use src/platform/native instead of Capacitor directly." },
            { group: ["**/screens/**"], message: "Screens compose features and components, not the other way round." },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["**/*.test.{ts,tsx,mjs}", "tests/**"],
    languageOptions: { globals: { ...globals.node } },
  },
);
