import { test } from "vitest";
import { RuleTester } from "eslint";
import rule, { PREFER } from "./prefer-closest-import-path";

const DEFAULT_OPTIONS = [{ paths: {} }];

test("prefer-closest-import-path: simple", () => {
  const ruleTester = new RuleTester({
    parserOptions: {
      sourceType: "module",
      ecmaVersion: 2015,
    },
  });

  ruleTester.run("prefer-closest-import-path", rule, {
    valid: [
      {
        options: DEFAULT_OPTIONS,
        filename: "src/foo.ts",
        code: `import a from "./stubs/a";`,
      },
      {
        options: DEFAULT_OPTIONS,
        filename: "src/stubs/deep2/foo.ts",
        code: `import a from "../deep/a";`,
      },
      {
        options: [{ paths: { "@x/*": ["src/stubs/*"] }, baseUrl: "./" }],
        filename: "src/foo.ts",
        code: `import a from "@x/a";`,
      },
      {
        options: [{ paths: { "@x/*": ["src/stubs/*"] }, baseUrl: "./" }],
        filename: "src/deep/foo.ts",
        code: `import a from "../stubs/notfound";`,
        // report by no-unresolved or tsc
      },
      {
        options: [{ paths: { "@/*": ["./src/*"] } }],
        filename: "src/deep/another/foo.ts",
        code: `import pkg from "../../../package.json";`,
      },
      {
        options: [{ paths: { "~/*": ["./*"] } }],
        filename: "src/deep/another/foo.ts",
        code: `import pkg from "~/package.json";`,
      },
      {
        options: DEFAULT_OPTIONS,
        filename: "src/stubs/deep2/foo.ts",
        code: `import x from "@x/a";`,
      },
      {
        options: DEFAULT_OPTIONS,
        filename: "src/deep/another/foo.ts",
        code: `import x from "@x/a"; import a from "../../stubs/a"`,
      },
      {
        options: [{ paths: { "@x/a/*": ["src/stubs/*/a"] }, baseUrl: "./" }],
        filename: "src/foo.ts",
        code: `import a from "@x/a/deep";`,
      },
    ],
    invalid: [
      {
        options: DEFAULT_OPTIONS,
        filename: "src/stubs/foo.ts",
        code: `import a from "../stubs/deep/../deep/a";`,
        output: `import a from "./deep/a";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "../stubs/deep/../deep/a",
              mostSuitable: "./deep/a",
            },
          },
        ],
      },
      {
        options: [{ paths: { "@x/*": ["src/stubs/*"] }, baseUrl: "./" }],
        filename: "src/foo.ts",
        code: `import a from "./stubs/a";`,
        output: `import a from "@x/a";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "./stubs/a",
              mostSuitable: "@x/a",
            },
          },
        ],
      },
      {
        options: [{ paths: { "@x/*": ["src/stubs/*"] }, baseUrl: "./" }],
        filename: "src/deep/foo.ts",
        code: `import a from "../stubs/a";`,
        output: `import a from "@x/a";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "../stubs/a",
              mostSuitable: "@x/a",
            },
          },
        ],
      },
      {
        options: [{ paths: { "@/*": ["src/*"] }, baseUrl: "./" }],
        filename: "src/stubs/foo.ts",
        code: `import a from "@/stubs/a";`,
        output: `import a from "./a";`,
        errors: [
          {
            messageId: "rewrite",
            data: { value: "@/stubs/a", mostSuitable: "./a" },
          },
        ],
      },
      {
        options: [{ paths: { "@/*": ["src/*"] }, baseUrl: "./" }],
        filename: "src/stubs/foo.ts",
        code: `import a from "../stubs/a";`,
        output: `import a from "./a";`,
        errors: [
          {
            messageId: "rewrite",
            data: { value: "../stubs/a", mostSuitable: "./a" },
          },
        ],
      },
      {
        options: [{ paths: { "@/*": ["src/*"] }, baseUrl: "./" }],
        filename: "src/deep/super/foo.ts",
        code: `import a from "../../stubs/a";`,
        output: `import a from "@/stubs/a";`,
        errors: [
          {
            messageId: "rewrite",
            data: { value: "../../stubs/a", mostSuitable: "@/stubs/a" },
          },
        ],
      },
      {
        options: [
          { paths: { "@/*": ["src/*"], "~/*": ["./*"] }, baseUrl: "./" },
        ],
        filename: "src/deep/another/foo.ts",
        code: `import pkg from "../../../package.json";`,
        output: `import pkg from "~/package.json";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "../../../package.json",
              mostSuitable: "~/package.json",
            },
          },
        ],
      },
      {
        options: [{ paths: { "@x/a/*": ["src/stubs/*/a"] }, baseUrl: "./" }],
        filename: "src/foo.ts",
        code: `import a from "./stubs/deep/a";`,
        output: `import a from "@x/a/deep";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "./stubs/deep/a",
              mostSuitable: "@x/a/deep",
            },
          },
        ],
      },
    ],
  });
});

test("prefer-closest-import-path: ignore", () => {
  const ruleTester = new RuleTester({
    parserOptions: {
      sourceType: "module",
      ecmaVersion: 2015,
    },
  });

  ruleTester.run("prefer-closest-import-path", rule, {
    valid: [
      {
        options: [
          {
            prefer: { "@x/*": PREFER.ignore },
            paths: { "@x/*": ["src/stubs/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/foo.ts",
        code: `import a from "@x/a";`,
      },
      {
        options: DEFAULT_OPTIONS,
        filename: "src/stubs/deep2/foo.ts",
        code: `import a from "../deep/a";`,
      },
      {
        options: [
          {
            prefer: { "@x/*": PREFER.ignore },
            paths: { "@x/*": ["src/stubs/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/deep/foo.ts",
        code: `import a from "../stubs/notfound";`,
        // report by no-unresolved or tsc
      },
      {
        options: [
          { prefer: { "@/*": PREFER.ignore }, paths: { "@/*": ["./src/*"] } },
        ],
        filename: "src/deep/another/foo.ts",
        code: `import pkg from "../../../package.json";`,
      },
      {
        options: [
          { prefer: { "~/*": PREFER.ignore }, paths: { "~/*": ["./*"] } },
        ],
        filename: "src/deep/another/foo.ts",
        code: `import pkg from "~/package.json";`,
      },

      {
        options: [
          {
            prefer: { "@x/a/*": PREFER.ignore },
            paths: { "@x/a/*": ["src/stubs/*/a"] },
            baseUrl: "./",
          },
        ],
        filename: "src/foo.ts",
        code: `import a from "@x/a/deep";`,
      },
    ],
    invalid: [
      {
        options: [
          {
            prefer: { "@x/*": PREFER.ignore },
            paths: {
              "@x/*": ["src/stubs/deep/*"],
              "@xx/*": ["src/stubs/deep2/*"],
            },
            baseUrl: "./",
          },
        ],
        filename: "src/foo.ts",
        code: `import a from "./stubs/deep2/b";`,
        output: `import a from "@xx/b";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "./stubs/deep2/b",
              mostSuitable: "@xx/b",
            },
          },
        ],
      },
    ],
  });
});

test("prefer-closest-import-path: samelevel multi patterns", () => {
  const ruleTester = new RuleTester({
    parserOptions: {
      sourceType: "module",
      ecmaVersion: 2015,
    },
  });

  ruleTester.run("prefer-closest-import-path", rule, {
    valid: [
      {
        name: "internal cis pattern 1",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/foo.ts",
        code: `import x from "./a";`,
      },
      {
        name: "internal cis pattern 2",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/foo.ts",
        code: `import x from "./b";`,
      },
      {
        name: "internal(deep) cis pattern 1",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/deep-a/foo.ts",
        code: `import x from "../a";`,
      },
      {
        name: "internal(deep) cis pattern 2",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/deep-a/foo.ts",
        code: `import x from "./a";`,
      },
      {
        name: "internal trans pattern 1",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/foo.ts",
        code: `import x from "@x/a";`,
      },
      {
        name: "internal trans pattern 2",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/foo.ts",
        code: `import x from "@x/b";`,
      },
      {
        name: "internal(deep) trans pattern 1",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/deep-b/foo.ts",
        code: `import x from "@x/deep-a/a";`,
      },
      {
        name: "internal(deep) trans pattern 2",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/deep-b/foo.ts",
        code: `import x from "@x/a";`,
      },
      {
        name: "external",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/dummy/foo.ts",
        code: `import x from "@x/a";`,
      },
    ],
    invalid: [
      {
        name: "internal cis pattern 1",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/foo.ts",
        code: `import x from "@x/a";`,
        output: `import x from "./a";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "@x/a",
              mostSuitable: "./a",
            },
          },
        ],
      },
      {
        name: "internal cis pattern 2",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/foo.ts",
        code: `import x from "@x/b";`,
        output: `import x from "./b";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "@x/b",
              mostSuitable: "./b",
            },
          },
        ],
      },
      {
        name: "internal trans pattern 1",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/foo.ts",
        code: `import x from "../deep/a";`,
        output: `import x from "@x/a";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "../deep/a",
              mostSuitable: "@x/a",
            },
          },
        ],
      },
      {
        name: "internal trans pattern 2",
        options: [
          {
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/foo.ts",
        code: `import x from "../deep2/b";`,
        output: `import x from "@x/b";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "../deep2/b",
              mostSuitable: "@x/b",
            },
          },
        ],
      },
    ],
  });
});

test("prefer-closest-import-path: samelevel multi patterns - prefer a", () => {
  const ruleTester = new RuleTester({
    parserOptions: {
      sourceType: "module",
      ecmaVersion: 2015,
    },
  });

  ruleTester.run("prefer-closest-import-path", rule, {
    valid: [
      {
        name: "internal cis pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/foo.ts",
        code: `import x from "@x/a";`,
      },
      {
        name: "internal cis pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/foo.ts",
        code: `import x from "@x/b";`,
      },
      {
        name: "internal(deep) cis pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep-a/*", "src/stubs/deep-b/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep-a/deep-a/foo.ts",
        code: `import x from "../a";`,
      },
      {
        name: "internal(deep) cis pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep-a/*", "src/stubs/deep-b/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep-a/deep-a/foo.ts",
        code: `import x from "./a";`,
      },
      {
        name: "internal trans pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/foo.ts",
        code: `import x from "@x/a";`,
      },
      {
        name: "internal trans pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/foo.ts",
        code: `import x from "@x/b";`,
      },
      {
        name: "internal(deep) trans pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep-a/*", "src/stubs/deep-b/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep-b/deep-b/foo.ts",
        code: `import x from "@x/deep-a/a";`,
      },
      {
        name: "internal(deep) trans pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep-a/*", "src/stubs/deep-b/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep-b/deep-b/foo.ts",
        code: `import x from "@x/a";`,
      },
      {
        name: "external",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/dummy/foo.ts",
        code: `import x from "@x/a";`,
      },
    ],
    invalid: [
      {
        name: "internal cis pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/foo.ts",
        code: `import x from "./a";`,
        output: `import x from "@x/a";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "./a",
              mostSuitable: "@x/a",
            },
          },
        ],
      },
      {
        name: "internal cis pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/foo.ts",
        code: `import x from "./b";`,
        output: `import x from "@x/b";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "./b",
              mostSuitable: "@x/b",
            },
          },
        ],
      },
      {
        name: "internal trans pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/foo.ts",
        code: `import x from "../deep/a";`,
        output: `import x from "@x/a";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "../deep/a",
              mostSuitable: "@x/a",
            },
          },
        ],
      },
      {
        name: "internal trans pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.aliasIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/foo.ts",
        code: `import x from "../deep2/b";`,
        output: `import x from "@x/b";`,
        errors: [
          {
            messageId: "rewrite",
            data: {
              value: "../deep2/b",
              mostSuitable: "@x/b",
            },
          },
        ],
      },
    ],
  });
});
