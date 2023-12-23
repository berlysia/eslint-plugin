import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTsconfig } from "get-tsconfig";
import type { Rule } from "eslint";
import slash from "slash";
import resolvePkg from "resolve";
import normalizePath from "../utils/normalizePath";
import { assumeAlias, matchAlias } from "../utils/alias";
import countSegmentLength from "../utils/countSegmentLength";
import lowestCommonAncestor from "../utils/lowestCommonAncestor";

const requireResolve = resolvePkg.sync;

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
  paths: Record<string, string[]>;
  baseUrl: string;
};

type Alias = Pick<Option, "paths" | "baseUrl">;

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
      },
      additionalProperties: false,
    },
    {
      type: "null",
    },
  ],
};

function pluckAlias(option: Partial<Alias> = {}): Alias | null {
  const { paths, baseUrl } = option;
  if (!paths && !baseUrl) {
    return null;
  }
  return {
    paths: paths ?? {},
    baseUrl: baseUrl ?? "./",
  };
}

function getPreferAccessor(prefer: Option["prefer"] | null | undefined) {
  const tmp = prefer ?? {};
  return function getPrefer(key: string | null) {
    if (!key) return PREFER.closest;
    return tmp[key] ?? PREFER.closest;
  };
}

const currentDir = dirname(fileURLToPath(import.meta.url));

function readPaths(cwd: string, alias: Alias): Alias["paths"] {
  const newPaths = { ...alias.paths };
  if (alias.baseUrl) {
    for (const [key, value] of Object.entries(newPaths)) {
      newPaths[key] = value.map((x) =>
        normalizePath(slash(relative(cwd, resolve(alias.baseUrl, x)))),
      );
    }
  }
  return newPaths;
}

function getTsconfigAlias(currentTarget: string) {
  const tsconfig = getTsconfig(currentTarget);
  if (tsconfig?.config.compilerOptions) {
    const { paths, baseUrl } = tsconfig.config.compilerOptions;
    return { paths: paths ?? {}, baseUrl: baseUrl ?? "./" };
  }
  return null;
}

const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "disallow inconsistent import path",
      category: "Stylistic Issues",
      recommended: true,
    },
    fixable: "code",
    schema: [schema],
    messages: {
      rewrite: `A more concise path is available: "{{mostSuitable}}" instead of "{{value}}"`,
    },
  },
  create(context: Rule.RuleContext) {
    const { cwd, physicalFilename } = context;

    const aliasFromOption = pluckAlias(context.options[0]);
    const tsconfigAlias = getTsconfigAlias(physicalFilename);
    const alias = aliasFromOption ??
      tsconfigAlias ?? {
        paths: {},
        baseUrl: "./",
      };

    const paths = readPaths(cwd, alias);
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
        const { value } = node;

        const currentFileDir = dirname(physicalFilename);

        // TODO: use the algorithm described in https://github.com/microsoft/TypeScript/issues/5039
        const matchedPaths = matchAlias(value, paths);
        const results =
          matchedPaths.length === 0
            ? [resolve(currentFileDir, value)]
            : matchedPaths.map((x) => resolve(cwd, x));

        const existingPaths = results.filter((x) => {
          const isPath =
            x.startsWith("./") || x.startsWith("../") || x.startsWith("/");
          const relativePath = normalizePath(
            slash(isPath ? relative(currentDir, x) : x),
          );
          console.log({ isPath, relativePath, currentDir, x });
          try {
            const resolved = requireResolve(relativePath, { extensions });
            return resolved !== value;
          } catch (error) {
            console.error(error);
            return false;
          }
        });

        const assumed = existingPaths.flatMap((x) => {
          const current = resolve(cwd, currentFileDir);
          const lca = lowestCommonAncestor(current, x);
          const normalizedLca = normalizePath(slash(relative(cwd, lca)));
          const lcaAssumed = assumeAlias(
            normalizedLca.endsWith("/") ? normalizedLca : `${normalizedLca}/`,
            paths,
          );

          const result = assumeAlias(
            normalizePath(slash(relative(cwd, x))),
            paths,
          );

          console.log({ lcaAssumed, result });

          return result.map((value) => ({
            alias: value.alias,
            isLcaAssumed: lcaAssumed.length > 0,
            value: value.rewritten,
          }));
        });

        const candidates = [
          ...existingPaths.map((x) => ({
            alias: null,
            isLcaAssumed: false,
            value: normalizePath(slash(relative(currentFileDir, x))),
          })),
          ...assumed,
        ];

        const mostSuitable = candidates.reduce<{
          ignored: boolean;
          minLength: number;
          isLcaAssumed: boolean;
          value: string;
        }>(
          (acc, curr) => {
            const prefer = getPrefer(curr.alias);
            if (prefer === PREFER.ignore)
              return {
                ...acc,
                ignored: true,
              };

            const length = countSegmentLength(curr.value);

            if (
              length < acc.minLength ||
              (length === acc.minLength &&
                (prefer === PREFER.aliasIfDescendant
                  ? curr.isLcaAssumed
                  : !curr.isLcaAssumed))
            ) {
              return {
                ignored: curr.alias ? false : acc.ignored,
                minLength: length,
                value: curr.value,
                isLcaAssumed: curr.isLcaAssumed,
              };
            }
            return acc;
          },
          {
            ignored: false,
            minLength: Number.POSITIVE_INFINITY,
            isLcaAssumed: false,
            value,
          },
        );

        console.log({
          physicalFilename,
          value,
          results,
          existingPaths,
          assumed,
          candidates,
          mostSuitable,
        });

        if (mostSuitable.ignored || mostSuitable.value === value) {
          return;
        }

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
