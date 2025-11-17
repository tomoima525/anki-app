import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  // Ignore patterns
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/build/**",
      "**/.wrangler/**",
      "**/pnpm-lock.yaml",
      "**/*.config.js",
      "**/*.config.mjs",
    ],
  },

  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Global configuration for all TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tseslint.parser,
      parserOptions: {
        project: ["./frontend/tsconfig.json", "./backend/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      // TypeScript specific rules
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",

      // General code quality rules
      "prefer-const": "warn",
      "no-var": "error",
    },
  },

  // Frontend-specific configuration (Next.js/React)
  {
    files: ["frontend/**/*.ts", "frontend/**/*.tsx"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Allow console in development
      "no-console": "off",
    },
  },

  // Backend-specific configuration (Cloudflare Workers)
  {
    files: ["backend/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  }
);
