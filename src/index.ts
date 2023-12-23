import type { ESLint } from "eslint";
import { version } from "../package.json";
import preferClosestImportPath from "./rules/prefer-closest-import-path";

const plugin: ESLint.Plugin = {
  meta: {
    name: "@berlysia/eslint-plugin",
    version,
  },
  rules: {
    "prefer-closest-import-path": preferClosestImportPath,
  },
};

plugin.configs ??= {};
plugin.configs.recommended = {
  plugins: {
    "@berlysia": plugin,
  },
  rules: {
    "@berlysia/prefer-closest-import-path": "error",
  },
};

export default plugin;
