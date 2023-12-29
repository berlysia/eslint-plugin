import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import type { Context } from "./typescript";
import { resolveImportPathInTypeScriptManner } from "./typescript";

function ensureNull<T>(x: T | undefined | null): T | null {
  return x ?? null;
}

const contextBase = {
  cwd: "/workspace/project",
};

function buildContainingFile(path: string) {
  return resolve(contextBase.cwd, dirname(path));
}

function createModuleExists(paths: string[]) {
  const exts = ["", ".js", ".jsx", ".ts", ".tsx"];
  return function moduleExists(this: Context, path: string) {
    return paths.some((p) =>
      exts.some((ext) => path + ext === resolve(this.cwd, p)),
    );
  };
}

type Case = {
  targetFilePath: string;
  rawImportPath: string;
  context: {
    baseUrl?: string;
    rootDirs?: string[];
    paths?: Record<string, string[]>;
  };
  moduleExists: string[];
  result: string | null /*  same as imput */;
};

describe("resolveImportPathInTypeScriptManner for absolute path", () => {
  const cases: Case[] = [
    {
      targetFilePath: "./src/index.js",
      rawImportPath: "aaabbb",
      context: {
        paths: {
          "a*b": ["./src/a/b/c/d/e/f/*"],
        },
      },
      moduleExists: ["./src/a/b/c/d/e/f/aabb.js"],
      result: "./a/b/c/d/e/f/aabb",
    },
    {
      targetFilePath: "./src/index.js",
      rawImportPath: "foo",
      context: {
        paths: {
          foo: ["./src/a/b/c/d/e/f"],
        },
      },
      moduleExists: ["./src/a/b/c/d/e/f.js"],
      result: "./a/b/c/d/e/f",
    },
    {
      targetFilePath: "./src/index.js",
      rawImportPath: "##/a/b/c/d/e/f",
      context: {
        paths: {
          "##/*": ["./src/*"],
        },
      },
      moduleExists: ["./src/a/b/c/d/e/f.js"],
      result: "./a/b/c/d/e/f",
    },
    {
      targetFilePath: "./src/index.js",
      rawImportPath: "##/a/b/c/d/e/f.js",
      context: {
        paths: {
          "##/*.js": ["./src/*.js"],
        },
      },
      moduleExists: ["./src/a/b/c/d/e/f.js"],
      result: "./a/b/c/d/e/f.js",
    },
    {
      targetFilePath: "./src/index.js",
      rawImportPath: "##/a/b/c/d/e/f.js",
      context: {
        paths: {
          "##/*.js": ["./src/*.js"],
        },
      },
      moduleExists: ["./src/a/b/c/d/e/f.js"],
      result: "./a/b/c/d/e/f.js",
    },
  ];
  it.each(cases)(
    "in $targetFilePath, import $rawImportPath, based on $context.baseUrl, with aliases $context.paths, results: $result",
    ({ targetFilePath, rawImportPath, context, moduleExists, result }) => {
      expect(
        ensureNull(
          resolveImportPathInTypeScriptManner(
            rawImportPath,
            buildContainingFile(targetFilePath),
            {
              ...contextBase,
              ...context,
              moduleExists: createModuleExists(moduleExists),
            },
          )?.importPath,
        ),
      ).toBe(result);
    },
  );
});

describe("resolveImportPathInTypeScriptManner for relative path", () => {
  const cases: Case[] = [
    {
      targetFilePath: "./src/index.js",
      rawImportPath: "src/file1",
      context: {
        baseUrl: "./",
      },
      moduleExists: ["./src/file1.js"],
      result: "src/file1",
    },
    {
      targetFilePath: "./src/index.js",
      rawImportPath: "./file1",
      context: {},
      moduleExists: ["./src/file1.js"],
      result: null, //  same as imput
    },
    {
      targetFilePath: "./src/index.js",
      rawImportPath: "./file1",
      context: {
        paths: {
          "*": ["*", "./generated/*"],
        },
      },
      moduleExists: ["./generated/file1.js"],
      result: "../generated/file1",
    },
    {
      targetFilePath: "./src/index.js",
      rawImportPath: "./file1",
      context: {
        rootDirs: ["src", "generated"],
      },
      moduleExists: ["generated/file1.js"],
      result: "./file1",
    },
    {
      targetFilePath: "./src/index.js",
      rawImportPath: "./file1",
      context: {
        rootDirs: ["src", "generated"],
      },
      moduleExists: ["src/file1.js"],
      result: "./file1",
    },
  ];
  it.each(cases)(
    "in $targetFilePath, import $rawImportPath, result: $result, rootDirs: $context.rootDirs, baseUrl: $context.baseUrl, aliases $context.paths, files: $moduleExists",
    ({ targetFilePath, rawImportPath, context, moduleExists, result }) => {
      expect(
        ensureNull(
          resolveImportPathInTypeScriptManner(
            rawImportPath,
            buildContainingFile(targetFilePath),
            {
              ...contextBase,
              ...context,
              moduleExists: createModuleExists(moduleExists),
            },
          )?.importPath,
        ),
      ).toBe(result);
    },
  );
});
