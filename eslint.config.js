import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/build/**",
      "**/dist/**",
      "**/.react-router/**",
      "**/node_modules/**",
      "artifacts/**",
      "**/coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "brace-style": ["error", "allman"],
      semi: ["error", "always"],
      quotes: ["error", "double", { avoidEscape: true }],
    },
  },
);
