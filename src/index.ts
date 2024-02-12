import type { ESLint, Linter } from "eslint";
import { version } from "../package.json";
import preferClosestImportPath from "./rules/prefer-closest-import-path";

const plugin = {
  meta: {
    name: "@berlysia/eslint-plugin",
    version,
  },
  rules: {
    "prefer-closest-import-path": preferClosestImportPath,
  },
  configs: {},
} satisfies ESLint.Plugin;

const recommended = {
  plugins: {
    "@berlysia": plugin,
  },
  rules: {
    "@berlysia/prefer-closest-import-path": "error",
  },
} satisfies Linter.FlatConfig;

plugin.configs = { recommended };

type Plugin = Omit<ESLint.Plugin, "configs"> & {
  configs: { recommended: Linter.FlatConfig };
};

export default plugin satisfies ESLint.Plugin as unknown as Plugin;
