import { version } from "../package.json";
import type { ESLint } from "eslint";

const plugin: ESLint.Plugin = {
  meta: {
    name: "@berlysia/eslint-plugin",
    version,
  },
  rules: {},
};

export default plugin;
