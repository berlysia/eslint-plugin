import { dirname, relative, resolve } from "node:path";
import { getTsconfig } from "get-tsconfig";
import type { Rule } from "eslint";
import normalizePath from "../utils/normalizePath";
import countSegmentLength from "../utils/countSegmentLength";
import lowestCommonAncestor from "../utils/lowestCommonAncestor";
import {
  resolveImportPathInTypeScriptManner,
  reverseResolve,
} from "../utils/resolver/typescript";
import { moduleExists as originalModuleExists } from "../utils/moduleExists";

const prefers = ["closest", "relativeIfDescendant", "ignore"] as const;

export const PREFER = Object.fromEntries(prefers.map((x) => [x, x])) as {
  [key in (typeof prefers)[number]]: key;
};

type Option = {
  prefer: Record<string, (typeof prefers)[number]>;
  paths?: Record<string, string[]>;
  baseUrl?: string;
  rootDirs?: string[];
};

type Alias = Pick<Option, "paths" | "baseUrl" | "rootDirs">;

const schema = {
  oneOf: [
    {
      type: "object",
      properties: {
        prefer: {
          type: "object",
          additionalProperties: {
            enum: prefers,
          },
        },
        paths: {
          type: "object",
          additionalProperties: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
        baseUrl: {
          type: "string",
        },
        rootDirs: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      additionalProperties: false,
    },
    {
      type: "null",
    },
  ],
};

function ensureAlias(option: Partial<Alias> = {}): Alias | null {
  const { paths, baseUrl, rootDirs } = option;
  if (!paths && !baseUrl && !rootDirs) {
    return null;
  }
  return {
    paths,
    baseUrl,
    rootDirs,
  };
}

function ensurePrefer(
  option: Option["prefer"] | null | undefined,
): Option["prefer"] {
  return option ?? Object.create(null);
}

function dropSlashStarFromKeys(preferMap: Option["prefer"]) {
  return Object.fromEntries(
    Object.entries(preferMap).map(([key, value]) => [
      key.replace(/\/\*$/, ""),
      value,
    ]),
  );
}

function getTsconfigAlias(currentTarget: string): Partial<Alias> | null {
  const tsconfig = getTsconfig(currentTarget);
  if (tsconfig?.config.compilerOptions) {
    const { paths, baseUrl, rootDirs } = tsconfig.config.compilerOptions;
    return {
      paths,
      baseUrl,
      rootDirs,
    };
  }
  return null;
}

const RESOLVED_WITH = [
  "relative-simple",
  "relative-parent",
  "paths",
  "baseUrl",
  "rootDirs",
  "module",
] as const;

type TestOption = {
  moduleExists: (x: string) => boolean;
};

const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "disallow inconsistent import path",
      category: "Stylistic Issues",
      recommended: true,
    },
    fixable: "code",
    schema: process.env.TESTING
      ? [
          schema,
          {
            oneOf: [
              {
                type: "object",
                additionalProperties: true,
              },
              {
                type: "null",
              },
            ],
          },
        ]
      : [schema],
    messages: {
      rewrite: `A more concise path is available: "{{mostSuitable}}" instead of "{{value}}"`,
    },
  },
  create(context: Rule.RuleContext) {
    const { cwd, physicalFilename } = context;

    const aliasFromOption = ensureAlias(context.options[0]);
    const testOption: TestOption | null =
      context.options[1] ?? Object.create(null);
    const tsconfigAlias = getTsconfigAlias(physicalFilename);
    const resolverContextForTS =
      aliasFromOption ?? tsconfigAlias ?? Object.create(null);
    const resolverContext = { ...resolverContextForTS, ...testOption, cwd };
    if (process.env.TESTING) {
      resolverContext.moduleExists =
        resolverContext.moduleExists?.bind(resolverContext);
    }
    const moduleExists = process.env.TESTING
      ? resolverContext.moduleExists ?? originalModuleExists
      : originalModuleExists;

    const preferMap = ensurePrefer(context.options[0]?.prefer);
    const preferMapForLCA = dropSlashStarFromKeys(preferMap);

    return {
      Literal(node) {
        if (
          !(
            ((node.parent.type === "ImportDeclaration" ||
              node.parent.type === "ExportNamedDeclaration" ||
              node.parent.type === "ExportAllDeclaration" ||
              node.parent.type === "ImportExpression") &&
              node.parent.source === node &&
              typeof node.value === "string") ||
            (node.parent.type === "CallExpression" &&
              node.parent.callee.type === "Identifier" &&
              node.parent.callee.name === "require" &&
              node.parent.arguments?.[0] === node &&
              typeof node.value === "string")
          )
        ) {
          return;
        }

        /*
          # algorithm
          1. resolve alias and get a root relative path, which exists
          2. list up all possible path notations
          3. choose the most suitable path
            - if we can decide most shortest path, choose it
            - if we can't decide most shortest path, choose the path which is relative
              - it says "LCA can be exactly assumed as alias path"
          4. rewrite the path
         */

        const { value } = node;

        const currentFileDir = normalizePath(dirname(physicalFilename));

        const resolved = resolveImportPathInTypeScriptManner(
          value,
          currentFileDir,
          resolverContext,
        );

        const resolvedAsAbsolutePath = normalizePath(
          resolve(cwd, currentFileDir, value),
        );

        // if both alias and original path don't point to any file, break
        if (!(resolved || moduleExists(resolvedAsAbsolutePath))) {
          return null;
        }

        // project root relative
        const importeePath =
          resolved?.rootRelative ??
          normalizePath(relative(cwd, resolvedAsAbsolutePath));

        const relativeImportPath = normalizePath(
          relative(currentFileDir, importeePath),
        );

        /**
         * インポート元からインポート先が直接祖先から1ホップ以下の関係にあるかどうか
         * 例えば、
         * - インポート元が src/a/b/c/d/e/f.ts
         * - インポート先が src/a/b/g.ts
         * - インポートパスは ../../../g.ts
         * なら、インポート元からインポート先が直接祖先から1ホップの関係にある
         * 一方で、
         * - インポート元が src/a/b/c/d/e/f.ts
         * - インポート先が src/a/b/g/h.ts
         * - インポートパスは ../../../g/h.ts
         * なら、インポート元からインポート先が直接祖先から1ホップの関係にない
         */
        const targetIsDirectAncestor = relativeImportPath
          .split("/")
          .slice(0, -1)
          .every((x) => x === "..");

        const assumedPaths = [
          {
            importPath: relativeImportPath,
            rootRelative: importeePath,
            resolvedWith: {
              type: importeePath.startsWith("..")
                ? "relative-parent"
                : "relative-simple",
            } as const,
            exact: false,
          },
          ...reverseResolve(importeePath, resolverContext),
        ];

        const lcaCache: Record<
          string,
          { lca: string; assumedPaths: ReturnType<typeof reverseResolve> }
        > = Object.create(null);

        function getLcaAndAssumedPaths(importeePath: string) {
          const cached = lcaCache[importeePath];
          if (cached) return cached;
          const lca = lowestCommonAncestor(importeePath, currentFileDir);
          const lcaAssumedPaths = reverseResolve(
            lca,
            resolverContext,
            true /* forLCA */,
          );
          lcaCache[importeePath] = {
            lca,
            assumedPaths: lcaAssumedPaths,
          };
          return lcaCache[importeePath];
        }

        const mostSuitable = assumedPaths.reduce<{
          length: number;
          value: string;
          resolveType: (typeof RESOLVED_WITH)[number];
        }>(
          (acc, curr) => {
            const prefer =
              curr.resolvedWith.type === "paths"
                ? preferMap[
                    (resolverContextForTS.baseUrl ?? "") +
                      curr.resolvedWith.pattern
                  ] ?? PREFER.closest
                : null;

            if (prefer === PREFER.ignore) {
              return acc;
            }

            const length = countSegmentLength(curr.importPath);
            /*
              1. 各表現でセグメント長が短いほうを優先する
            */
            if (length < acc.length) {
              return {
                length,
                value: curr.importPath,
                resolveType: curr.resolvedWith.type,
              };
            }

            /*
              2. 同じ長さのとき
            */
            if (length === acc.length) {
              const lca = getLcaAndAssumedPaths(curr.rootRelative);
              const exactMatched = lca.assumedPaths.find((x) => x.exact);
              /*
                - インポート元と先のパスのLCAをとったときに、LCAがエイリアスで表現できるとき
              */
              if (exactMatched) {
                const lcaPrefer = preferMapForLCA[exactMatched.importPath];
                /*
                  - オプションできめる
                    - closest 最短を選ぶ(パススルー)
                    - relativeIfDescendant 直接子孫の関係でなければエイリアス
                */
                if (
                  lcaPrefer === PREFER.relativeIfDescendant &&
                  !targetIsDirectAncestor
                ) {
                  return {
                    length,
                    value: curr.importPath,
                    resolveType: "paths",
                  };
                }
              }

              /*
                - できないとき
                  - 相対パス > エイリアス > 親方向参照 > baseUrl, rootDirs, モジュール
              */
              const accResolveTypeIndex = RESOLVED_WITH.indexOf(
                acc.resolveType,
              );
              const currResolveTypeIndex = RESOLVED_WITH.indexOf(
                curr.resolvedWith.type,
              );
              if (currResolveTypeIndex < accResolveTypeIndex) {
                return {
                  length,
                  value: curr.importPath,
                  resolveType: curr.resolvedWith.type,
                };
              }
            }
            return acc;
          },
          {
            length: Number.POSITIVE_INFINITY,
            value: "",
            resolveType: "module",
          },
        );

        if (mostSuitable.value === value) return;

        context.report({
          node,
          messageId: "rewrite",
          data: {
            mostSuitable: mostSuitable.value,
            value,
          },
          fix(fixer) {
            return fixer.replaceText(node, JSON.stringify(mostSuitable.value));
          },
        });
      },
    };
  },
};

export default rule;
