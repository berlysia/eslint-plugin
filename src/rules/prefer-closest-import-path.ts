import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTsconfig } from "get-tsconfig";
import type { Rule } from "eslint";
import slash from "slash";
import resolvePkg from "resolve";
import normalizePath from "../utils/normalizePath";
import { assumeAlias, matchAlias } from "../utils/alias";
import countSegmentLength from "../utils/countSegmentLength";
import lowestCommonAncestor from "../utils/lowestCommonAncestor";
import {
  resolveImportPathInTypeScriptManner,
  reverseResolve,
} from "../utils/resolver/typescript";
import { moduleExists as originalModuleExists } from "../utils/moduleExists";

// js/ts/jsx/tsx x cjs/esm
const extensions = [
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".cjs",
  ".mjs",
  ".cts",
  ".mts",
  ".cjsx",
  ".mjsx",
  ".ctsx",
  ".mtsx",
  ".json",
];

const prefers = ["closest", "aliasIfDescendant", "ignore"] as const;

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

function getPreferAccessor(prefer: Option["prefer"] | null | undefined) {
  const tmp = prefer ?? {};
  return function getPrefer(key: string | null) {
    if (!key) return PREFER.closest;
    return tmp[key] ?? PREFER.closest;
  };
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
    const testOption: TestOption | null = context.options[1] ?? {};
    const tsconfigAlias = getTsconfigAlias(physicalFilename);
    const resolverContextForTS = aliasFromOption ?? tsconfigAlias ?? {};
    const resolverContext = { ...resolverContextForTS, ...testOption, cwd };
    if (process.env.TESTING) {
      resolverContext.moduleExists =
        resolverContext.moduleExists?.bind(resolverContext);
    }
    const moduleExists = process.env.TESTING
      ? resolverContext.moduleExists ?? originalModuleExists
      : originalModuleExists;

    const getPrefer = getPreferAccessor(context.options[0]?.prefer);

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

        // エイリアスも元の記述もファイルに行きあたらないときは打ち切る
        if (!(resolved || moduleExists(resolvedAsAbsolutePath))) {
          // console.log("打ち切り", { resolved, resolvedAsAbsolutePath });
          return null;
        }

        // プロジェクトルート相対パスになっている
        const importeePath =
          resolved?.rootRelative ??
          normalizePath(relative(cwd, resolvedAsAbsolutePath));

        const assumedPaths = [
          {
            importPath: normalizePath(relative(currentFileDir, importeePath)),
            rootRelative: importeePath,
            resolvedWith: { type: "written" } as const,
          },
          ...reverseResolve(importeePath, resolverContext),
        ];

        const lcaCache = Object.create(null);

        function getLcaAndAssumedPaths(importeePath: string) {
          const cached = lcaCache[importeePath];
          if (cached) return cached;
          const lca = lowestCommonAncestor(importeePath, currentFileDir);
          const lcaAssumedPaths = reverseResolve(
            lca,
            resolverContext,
            true/* forLCA */
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
        }>(
          (acc, curr) => {
            const prefer =
              curr.resolvedWith.type === "paths"
                ? getPrefer(curr.resolvedWith.value)
                : null;

            if (prefer === PREFER.ignore) {
              return acc;
            }

            const length = countSegmentLength(curr.importPath);
            /*
              1. 長さが短いほうが優先
              2. 同じ長さのときの優先度
                - インポート元と先のパスのLCAをとったときに、LCAがエイリアスで表現できるとき
                  - 完全一致する
                    - オプションできめる
                  - できないとき
                相対パス > エイリアス > 親方向参照 > モジュール
            */
            if (length < acc.length) {
              return {
                length,
                value: curr.importPath,
              };
            }
            if (length === acc.length) {
              const lca = getLcaAndAssumedPaths(curr.rootRelative);
              const isLcaAssumed = lca.assumedPaths.length > 0;
              console.log(lca.lca, lca.assumedPaths);
            }
            return acc;
          },
          {
            length: Number.POSITIVE_INFINITY,
            value: "",
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
