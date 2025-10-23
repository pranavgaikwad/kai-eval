import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

const importPluginCompat = importPlugin.default || importPlugin;

export default [
  // Global ignores for the runner package
  {
    ignores: ["**/node_modules/**", "**/dist/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx,js,mjs,cjs}"],
    plugins: {
      import: importPluginCompat,
    },
    rules: {
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"]],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "no-duplicate-imports": "warn",
      "no-unused-vars": "off", // Disable base rule as it can report incorrect errors
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "vars": "all",
          "args": "after-used",
          "ignoreRestSiblings": true,
          "varsIgnorePattern": "^_",
          "argsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ],

    },
  },
];
