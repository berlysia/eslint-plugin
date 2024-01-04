import path from "node:path";
import { moduleExists } from "../moduleExists";
import normalizePath from "../normalizePath";
import Log from "../logger";

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
  importerDir: string,
  rawContext: Partial<Context>,
): ResolveResult | null {
  const context = ensureContext(rawContext);
  {
    const resolved = resolveWithPaths(given, importerDir, context);

    if (resolved) return resolved;
  }

  {
    const resolved = isRelativeStartWithDot(given)
      ? resolveWithRootDirs(given, importerDir, context)
      : resolveWithBaseUrl(given, importerDir, context);

    if (resolved) return resolved;
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
  return captured === null ? subst : subst.replace("*", captured);
}

function resolveWithPaths(
  given: string,
  importerDir: string,
  context: Context,
): ResolveResult | null {
  Log.log("resolveWithPaths", { given, importerDir, context });
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
        const absolutePath = normalizePath(
          path.join(context.cwd, context.baseUrl, applied),
        );
        if (context.moduleExists(absolutePath)) {
          return {
            rootRelative: normalizePath(
              path.relative(context.cwd, absolutePath),
            ),
            importPath: normalizePath(applied),
          };
        }
      }
      // baseUrlがないとき→appliedをmoduleとして解決
      if (context.moduleExists(applied)) {
        return {
          rootRelative: applied,
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
  Log.log("resolveWithBaseUrl", { given, importerDir, context });
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
        rootRelative: given,
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
  Log.log("resolveWithRootDirs", { given, importerDir, context });
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

function invertPaths(
  paths: NonNullable<Context["paths"]>,
  baseUrl: string | undefined,
  forLCA: boolean,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [pattern, substitutions] of Object.entries(paths)) {
    assertAliasStarCount(pattern);
    const patternDroppedSlashStar = pattern.endsWith("/*")
      ? pattern.slice(0, -2)
      : null;
    for (const subst of substitutions) {
      assertAliasStarCount(subst);
      const key = isRelativeStartWithDot(subst)
        ? subst
        : baseUrl
          ? normalizePath(path.join(baseUrl, subst))
          : subst;
      const tmp = result[key] ?? [];
      tmp.push(pattern);
      result[key] = tmp;

      if (!forLCA) continue;
      const substDroppedSlashStar = subst.endsWith("/*")
        ? subst.slice(0, -2)
        : null;

      if (substDroppedSlashStar && patternDroppedSlashStar) {
        const key = isRelativeStartWithDot(substDroppedSlashStar)
          ? substDroppedSlashStar
          : baseUrl
            ? normalizePath(path.join(baseUrl, substDroppedSlashStar))
            : substDroppedSlashStar;
        const tmp = result[key] ?? [];
        tmp.push(patternDroppedSlashStar);
        result[key] = tmp;
      }
    }
  }
  return result;
}

export function reverseResolve(
  rootRelativePath: string,
  rawContext: Partial<Context>,
  forLCA = false,
) {
  const context = ensureContext(rawContext);
  const result = [];

  if (context.paths) {
    const inverted = invertPaths(context.paths, context.baseUrl, forLCA);
    const matched = matchByPattern(rootRelativePath, inverted);

    const substitutions = matched ? inverted[matched.pattern] ?? [] : [];
    for (const subst of substitutions) {
      const applied = resolveSubstitution(subst, matched?.captured ?? "");
      result.push({
        resolvedWith: {
          type: "paths",
          pattern: subst,
          matched: matched!.pattern,
        } as const,
        importPath: applied,
        rootRelative: rootRelativePath,
        exact: applied === subst,
      });
    }
  }

  if (context.baseUrl) {
    const resolvedBaseUrl = normalizePath(
      path.join(context.cwd, context.baseUrl),
    );
    if (context.cwd !== resolvedBaseUrl) {
      const absolute = normalizePath(path.join(context.cwd, rootRelativePath));
      const relativeFromBaseUrl = normalizePath(
        path.relative(resolvedBaseUrl, absolute),
      );
      const trimmed = relativeFromBaseUrl.replace(/^\.\.?\//, "");
      result.push({
        resolvedWith: {
          type: "baseUrl",
          value: context.baseUrl,
        } as const,
        importPath: trimmed,
        rootRelative: rootRelativePath,
        exact: false,
      });
    }
  }

  if (context.rootDirs) {
    for (const rootDir of context.rootDirs) {
      const absolute = normalizePath(path.join(context.cwd, rootRelativePath));
      const relativeFromRootDir = normalizePath(
        path.relative(path.join(context.cwd, rootDir), absolute),
      );
      result.push({
        resolvedWith: {
          type: "rootDirs",
          value: rootDir,
        } as const,
        importPath: relativeFromRootDir,
        rootRelative: rootRelativePath,
        exact: false, // 判定可能だが使わないのでいったんfalse
      });
    }
  }

  return result;
}
