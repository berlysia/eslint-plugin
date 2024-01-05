import path, { isAbsolute } from "node:path";
import isCoreModule from "is-core-module";

const scopedRegexp = /^@[^/]+\/[^/]+/;
function isScopedModule(name: string) {
  return scopedRegexp.test(name);
}

const moduleRegexp = /^\w/;
function isModule(name: string) {
  return moduleRegexp.test(name);
}

function getBaseModule(name: string) {
  if (isScopedModule(name)) {
    const [scope, pkg] = name.split("/");
    return `${scope}/${pkg}`;
  }
  const [pkg] = name.split("/");
  return pkg;
}

function isBuiltin(name: string) {
  const base = getBaseModule(name);
  return isCoreModule(base);
}

function isExternalPath(
  name: string,
  cwd: string,
  moduleExists: (name: string) => string | false,
) {
  const resolved = moduleExists(name);
  if (!resolved) return false;

  const rootRelative = path.relative(cwd, resolved);
  if (rootRelative.startsWith("..")) {
    return true;
  }

  const nodeModules = path.join(cwd, "node_modules");
  const nodeModulesRelative = path.relative(nodeModules, resolved);
  return !nodeModulesRelative.startsWith("..");
}

function isInternalPath(name: string, cwd: string) {
  return !path.relative(cwd, name).startsWith("..");
}

function isExternalishName(name: string) {
  return isScopedModule(name) || isModule(name);
}

function isRelativeToParent(name: string) {
  return name.startsWith("../");
}

const indexFiles = new Set([
  ".",
  "./",
  "./index",
  "./index.js",
  "./index.ts",
  "./index.tsx",
]);
function isIndex(name: string) {
  return indexFiles.has(name);
}

function isRelativeToSibling(name: string) {
  return name.startsWith("./");
}

export default function detectImportType(
  name: string,
  cwd: string,
  moduleExists: (name: string) => string | false,
) {
  if (isAbsolute(name)) {
    return "absolute";
  }
  if (isBuiltin(name)) {
    return "builtin";
  }
  if (isRelativeToParent(name)) {
    return "relative-parent";
  }
  if (isIndex(name)) {
    return "index";
  }
  if (isRelativeToSibling(name)) {
    return "relative-sibling";
  }
  if (isExternalPath(name, cwd, moduleExists)) {
    return "external";
  }
  if (isInternalPath(name, cwd)) {
    return "internal";
  }
  if (isExternalishName(name)) {
    return "external";
  }
  return "unknown";
}

export type ImportType = ReturnType<typeof detectImportType>;
