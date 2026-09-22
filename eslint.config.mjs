import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

const config = [
  {
    ignores: [
      ".next/**",
      ".local-postgres/**",
      "ios/**",
      "ios-native/**/DerivedData/**",
      "node_modules/**",
      "next-env.d.ts",
      "playwright-report/**",
      "public/uploads/**",
      "test-results/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "prefer-const": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
];

export default config;
