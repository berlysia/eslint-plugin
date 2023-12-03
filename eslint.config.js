import berlysia from "@berlysia/eslint-config";
import eslintPluginEslintPlugin from "eslint-plugin-eslint-plugin";

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
    plugins: {
      "eslint-plugin": eslintPluginEslintPlugin,
    },
    rules: {
      ...eslintPluginEslintPlugin.configs.recommended.rules,
    },
  },
);
