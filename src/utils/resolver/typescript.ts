import path, { normalize } from "node:path";
import { moduleExists } from "../moduleExists";
import normalizePath from "../normalizePath";

// based on https://github.com/microsoft/TypeScript/issues/5039

const starPattern = /\*/g;
function getStarCount(pattern: string) {
  const matched = pattern.match(starPattern);
  return matched?.length ?? 0;
}

function hasValidStarCount(pattern: string) {
  return getStarCount(pattern) <= 1;
}

function isRelativeStartWithDot(given: string): boolean {
  return given.startsWith(".");
}

export type Context = {
  cwd: string;
  baseUrl?: string;
  paths?: Record<string, string[]>;
  rootDirs?: string[];
  moduleExists: (path: string) => boolean;
};

function ensureContext(partial: Partial<Context>): Context {
  return {
    cwd: process.cwd(),
    moduleExists,
    ...partial,
  };
}

function assertAliasStarCount(alias: string) {
  if (!hasValidStarCount(alias)) throw new Error("Invalid alias pattern");
}

type ResolveResult = { rootRelative: string; importPath: string };

export function resolveImportPathInTypeScriptManner(
  given: string,
  fromFile: string,
  rawContext: Partial<Context>,
): string | null {
  const context = ensureContext(rawContext);
  const importerDir = path.dirname(fromFile);
  {
    const resolved = resolveWithPaths(given, importerDir, context);

    if (resolved) return resolved.importPath;
  }

  {
    const resolved = isRelativeStartWithDot(given)
      ? resolveWithRootDirs(given, importerDir, context)
      : resolveWithBaseUrl(given, importerDir, context);

    if (resolved) return resolved.importPath;
  }

  return null;
}

function matchByPattern(
  given: string,
  paths: NonNullable<Context["paths"]>,
): {
  pattern: string;
  captured: string | null;
  prefixLength: number;
} | null {
  let matched:
    | {
        pattern: null;
        captured: null;
        prefixLength: number;
      }
    | {
        pattern: string;
        captured: string | null;
        prefixLength: number;
      } = {
    pattern: null,
    captured: null,
    prefixLength: -1,
  };

  for (const alias of Object.keys(paths)) {
    assertAliasStarCount(alias);

    const starIndex = alias.indexOf("*");
    if (starIndex !== -1) {
      const prefix = alias.slice(0, starIndex);
      const suffix = alias.slice(starIndex + 1);
      if (
        prefix.length + suffix.length <= given.length &&
        given.startsWith(prefix) &&
        given.endsWith(suffix) &&
        matched.prefixLength < prefix.length
      ) {
        matched = {
          pattern: alias,
          captured: given.slice(prefix.length, given.length - suffix.length),
          prefixLength: prefix.length,
        };
      }
    }

    if (given === alias) {
      return {
        pattern: alias,
        captured: null,
        prefixLength: 0,
      };
    }
  }

  return matched.pattern === null ? null : matched;
}

function resolveSubstitution(subst: string, captured: string | null): string {
  return captured ? subst.replace("*", captured) : subst;
}

function resolveWithPaths(
  given: string,
  importerDir: string,
  context: Context,
): ResolveResult | null {
  console.log("resolveWithPaths", { given, importerDir, context });
  if (!context.paths) return null;

  const matched = matchByPattern(given, context.paths);

  if (!matched) return null;

  const substitutions = context.paths[matched.pattern] ?? [];
  for (const subst of substitutions) {
    assertAliasStarCount(subst);
    // RootRelative or Module
    const applied = resolveSubstitution(subst, matched.captured);

    if (isRelativeStartWithDot(applied)) {
      // RootRelativeなもののうちsyntaxにあらわれているもの
      const absolutePath = normalizePath(path.join(context.cwd, applied));
      if (context.moduleExists(absolutePath)) {
        return {
          rootRelative: normalizePath(path.relative(context.cwd, absolutePath)),
          importPath: normalizePath(path.relative(importerDir, absolutePath)),
        };
      }
    } else {
      // baseUrlがあるとき→appliedをbaseUrlからの相対パスとして先に解決
      if (context.baseUrl) {
        const absolutePath = normalizePath(path.join(context.baseUrl, applied));
        if (context.moduleExists(absolutePath)) {
          return {
            rootRelative: normalizePath(
              path.relative(context.cwd, absolutePath),
            ),
            importPath: applied,
          };
        }
      }
      // baseUrlがないとき→appliedをmoduleとして解決
      if (context.moduleExists(applied)) {
        return {
          rootRelative: normalizePath(path.relative(context.cwd, applied)),
          importPath: applied,
        };
      }
    }
  }

  return null;
}

function resolveWithBaseUrl(
  given: string,
  importerDir: string,
  context: Context,
): ResolveResult | null {
  console.log("resolveWithBaseUrl", { given, importerDir, context });
  if (isRelativeStartWithDot(given)) {
    // RootRelativeなもののうちsyntaxにあらわれているもの
    const absolutePath = normalizePath(path.join(context.cwd, given));
    if (context.moduleExists(absolutePath)) {
      return {
        rootRelative: normalizePath(path.relative(context.cwd, absolutePath)),
        importPath: normalizePath(path.relative(importerDir, absolutePath)),
      };
    }
  } else {
    // baseUrlがあるとき→givenをbaseUrlからの相対パスとして先に解決
    if (context.baseUrl) {
      const absolutePath = normalizePath(
        path.join(context.cwd, context.baseUrl, given),
      );
      if (context.moduleExists(absolutePath)) {
        return {
          rootRelative: normalizePath(path.relative(context.cwd, absolutePath)),
          importPath: given,
        };
      }
    }
    // baseUrlがないとき→givenをmoduleとして解決
    if (context.moduleExists(given)) {
      return {
        rootRelative: normalizePath(path.relative(context.cwd, given)),
        importPath: given,
      };
    }
  }
  return null;
}

function resolveWithRootDirs(
  given: string,
  importerDir: string,
  context: Context,
): ResolveResult | null {
  console.log("resolveWithRootDirs", { given, importerDir, context });
  if (!context.rootDirs) return null;

  const candidate = normalizePath(path.join(importerDir, given));

  let matched:
    | {
        rootDir: string;
        normalized: string;
      }
    | {
        rootDir: null;
        normalized: null;
      } = {
    rootDir: null,
    normalized: null,
  };

  for (const rootDir of context.rootDirs) {
    const normalized = normalizePath(path.join(context.cwd, rootDir));
    if (
      candidate.startsWith(normalized) &&
      (!matched.normalized || matched.normalized?.length < normalized.length)
    ) {
      matched = {
        rootDir,
        normalized,
      };
    }
  }

  if (matched.normalized) {
    if (context.moduleExists(candidate)) {
      return {
        rootRelative: normalizePath(path.relative(context.cwd, candidate)),
        importPath: given,
      };
    }

    for (const rootDir of context.rootDirs) {
      const absolutePath = normalizePath(
        path.join(context.cwd, rootDir, given),
      );
      if (context.moduleExists(absolutePath)) {
        return {
          rootRelative: normalizePath(path.relative(context.cwd, absolutePath)),
          importPath: given,
        };
      }
    }
  }

  return null;
}
