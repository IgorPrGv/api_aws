// eslint.config.mjs
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Base JS rules
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    ignores: ["dist/**", "node_modules/**"],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    ...js.configs.recommended, // em vez de plugins:{js},extends:["js/recommended"]
  },

  // TypeScript rules
  {
    files: ["**/*.{ts,mts,cts}"],
    extends: tseslint.configs.recommended,
  },
  
]);
