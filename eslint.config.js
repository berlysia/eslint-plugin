import berlysia from "@berlysia/eslint-config";
import eslintPluginEslintPlugin from "eslint-plugin-eslint-plugin";
import myPlugin from "@berlysia/eslint-plugin";

const currentRootDir = process.cwd();

export default berlysia(
  {
    testLibrary: "vitest",
    typescript: {
      tsconfigRootDir: currentRootDir,
      project: ["./tsconfig.json"],
    },
  },
  {
    ignores: ["node_modules", "dist"],
  },
  {
    files: ["src/stubs/**/*"],
    rules: {
      "unicorn/no-empty-file": "off",
    },
  },
  {
    plugins: {
      "eslint-plugin": eslintPluginEslintPlugin,
      "@berlysia": myPlugin,
    },
    rules: {
      ...eslintPluginEslintPlugin.configs.recommended.rules,
      ...myPlugin.configs.recommended.rules,
    },
  },
);
