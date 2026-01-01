// =============================================================================
// ESLint Configuration (Flat Config)
// https://eslint.org/docs/latest/use/configure/configuration-files-new
// =============================================================================

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import vitest from "@vitest/eslint-plugin";
import importPlugin from "eslint-plugin-import";

export default tseslint.config(
  // ===========================================================================
  // Global Ignores
  // ===========================================================================
  {
    ignores: [
      "dist/",
      "coverage/",
      "node_modules/",
      "results/",
      "reports/",
      "*.config.js",
      "*.config.ts",
    ],
  },

  // ===========================================================================
  // Base ESLint Recommended Rules
  // ===========================================================================
  eslint.configs.recommended,

  // ===========================================================================
  // TypeScript Strict Configuration
  // ===========================================================================
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // ===========================================================================
  // TypeScript Parser Options
  // ===========================================================================
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ===========================================================================
  // Main Source Files Configuration
  // ===========================================================================
  {
    files: ["src/**/*.ts"],
    plugins: {
      import: importPlugin,
    },
    rules: {
      // -----------------------------------------------------------------------
      // TypeScript Type Safety
      // -----------------------------------------------------------------------
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",

      // -----------------------------------------------------------------------
      // TypeScript Best Practices
      // -----------------------------------------------------------------------
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],

      // -----------------------------------------------------------------------
      // Import/Export Type Safety (Critical for ESM)
      // -----------------------------------------------------------------------
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
          disallowTypeAnnotations: true,
        },
      ],
      "@typescript-eslint/consistent-type-exports": [
        "error",
        { fixMixedExportsWithInlineTypeSpecifier: true },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",

      // -----------------------------------------------------------------------
      // Async/Await Best Practices
      // -----------------------------------------------------------------------
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/promise-function-async": "error",
      "no-return-await": "off",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],

      // -----------------------------------------------------------------------
      // Import Organization
      // -----------------------------------------------------------------------
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "type",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-duplicates": ["error", { "prefer-inline": true }],
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-cycle": ["error", { maxDepth: 10 }],
      "import/no-self-import": "error",
      "import/no-useless-path-segments": "error",

      // -----------------------------------------------------------------------
      // General JavaScript Best Practices
      // -----------------------------------------------------------------------
      "no-console": "off", // CLI tool - console output is expected
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-throw-literal": "error",
      "prefer-promise-reject-errors": "error",
      "no-param-reassign": ["error", { props: false }],
      "no-nested-ternary": "error",

      // -----------------------------------------------------------------------
      // Code Quality
      // -----------------------------------------------------------------------
      "max-depth": ["warn", 4],
      complexity: ["warn", 20],
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // ===========================================================================
  // Test Files Configuration
  // ===========================================================================
  {
    files: ["src/**/*.test.ts", "src/**/*.spec.ts", "tests/**/*.ts"],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,

      // Vitest best practices
      "vitest/expect-expect": "error",
      "vitest/no-disabled-tests": "warn",
      "vitest/no-focused-tests": "error",
      "vitest/no-identical-title": "error",
      "vitest/prefer-to-be": "error",
      "vitest/prefer-to-have-length": "error",
      "vitest/valid-expect": "error",

      // Relax TypeScript strictness for tests
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",

      // Relax code quality rules for tests
      "max-lines-per-function": "off",
      complexity: "off",
    },
  }
);
