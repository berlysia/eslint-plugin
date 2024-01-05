import { relative, resolve } from "node:path";
import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import rule, { PREFER } from "./prefer-closest-import-path";

const DEFAULT_OPTIONS = [{ paths: {} }];

const ruleTester = new RuleTester({
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 2015,
  },
});

function createModuleExists(paths: string[] = []) {
  const exts = ["", ".js", ".jsx", ".ts", ".tsx"];
  return function moduleExists(this: { cwd: string }, absolutePath: string) {
    for (const p of paths) {
      const resolved = resolve(this.cwd, p);
      if (
        p.startsWith("node_modules") &&
        absolutePath === p.replace("node_modules/", "")
      ) {
        return resolved;
      }
      for (const ext of exts) {
        if (absolutePath + ext === resolved) {
          return resolved;
        }
      }
    }
    return false;
  };
}

function validTester({
  code,
  filename,
  moduleExists,
  options = DEFAULT_OPTIONS,
}: {
  code: string;
  filename?: string;
  options?: RuleTester.ValidTestCase["options"];
  moduleExists?: string[];
}) {
  ruleTester.run("prefer-closest-import-path", rule, {
    valid: [
      {
        filename,
        code,
        options: [
          ...options,
          { moduleExists: createModuleExists(moduleExists) },
        ],
      },
    ],
    invalid: [],
  });
}

function invalidTester({
  code,
  filename,
  errors,
  output,
  moduleExists,
  options = DEFAULT_OPTIONS,
}: {
  code: string;
  filename?: string;
  errors: RuleTester.InvalidTestCase["errors"];
  output: RuleTester.InvalidTestCase["output"];
  options?: RuleTester.InvalidTestCase["options"];
  moduleExists?: string[];
}) {
  ruleTester.run("prefer-closest-import-path", rule, {
    valid: [],
    invalid: [
      {
        filename,
        code,
        errors,
        output,
        options: [
          ...options,
          { moduleExists: createModuleExists(moduleExists) },
        ],
      },
    ],
  });
}

describe("prefer-closest-import-path: basic", () => {
  it("basic 1", () => {
    validTester({
      options: DEFAULT_OPTIONS,
      filename: "src/foo.ts",
      code: `import a from "./stubs/a";`,
      moduleExists: ["./src/stubs/a"],
    });
  });
  it("basic 2", () => {
    validTester({
      options: DEFAULT_OPTIONS,
      filename: "src/stubs/deep2/foo.ts",
      code: `import a from "../deep/a";`,
      moduleExists: ["./src/stubs/deep/a"],
    });
  });
  it("basic module", () => {
    validTester({
      options: DEFAULT_OPTIONS,
      filename: "src/stubs/a.ts",
      code: `import a from "mymod";`,
      moduleExists: ["node_modules/mymod"],
    });
  });
  it("basic module(deep)", () => {
    validTester({
      options: DEFAULT_OPTIONS,
      filename: "src/stubs/a.ts",
      code: `import a from "mymod/deep";`,
      moduleExists: ["node_modules/mymod"],
    });
  });
});

describe("prefer-closest-import-path: paths", () => {
  describe("simple", () => {
    it("valid", () => {
      validTester({
        options: [{ paths: { "@x/*": ["./src/stubs/*"] } }],
        filename: "src/foo.ts",
        code: `import a from "@x/a";`,
        moduleExists: ["./src/stubs/a"],
      });
    });
    it("invalid", () => {
      invalidTester({
        options: [{ paths: { "@x/*": ["./src/stubs/*"] } }],
        filename: "src/foo.ts",
        moduleExists: ["./src/stubs/a"],
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
      });
    });
  });
});

describe.each([
  { prefer: PREFER.closest },
  { prefer: PREFER.relativeIfDescendant },
])("prefer-closest-import-path: paths(complex) - $prefer", ({ prefer }) => {
  /*
  - a
    - b(alias @/ means a/b/)
      - from.ts
      - to.ts
  */
  it("alias is placed at LCA", () => {
    const code = {
      [PREFER.closest]: `import x from "./to";`,
      [PREFER.relativeIfDescendant]: `import x from "@/to";`,
    };
    validTester({
      options: [{ paths: { "@/*": ["./a/b/*"] }, prefer: { "@/*": prefer } }],
      filename: "a/b/from.ts",
      code: code[prefer],
      moduleExists: ["./a/b/to"],
    });
  });
  it("alias is placed at LCA - invalid", () => {
    const importPath = {
      [PREFER.closest]: {
        from: "@/to",
        to: "./to",
      },
      [PREFER.relativeIfDescendant]: {
        from: "./to",
        to: "@/to",
      },
    }[prefer];
    invalidTester({
      options: [{ paths: { "@/*": ["./a/b/*"] }, prefer: { "@/*": prefer } }],
      filename: "a/b/from.ts",
      code: `import x from "${importPath.from}";`,
      output: `import x from "${importPath.to}";`,
      moduleExists: ["./a/b/to"],
      errors: [
        {
          messageId: "rewrite",
          data: {
            value: importPath.from,
            mostSuitable: importPath.to,
          },
        },
      ],
    });
  });
  /*
  - a
    - b(alias @/ means a/b/)
      - c
        - from.ts
        - to.ts
  */
  it("alias is placed at an ancestor of LCA", () => {
    validTester({
      options: [{ paths: { "@/*": ["./a/b/*"] }, prefer: { "@/*": prefer } }],
      filename: "a/b/c/from.ts",
      code: `import x from "./to";`,
      moduleExists: ["./a/b/c/to"],
    });
  });
  it("alias is placed at an ancestor of LCA - invalid", () => {
    invalidTester({
      options: [{ paths: { "@/*": ["./a/b/*"] }, prefer: { "@/*": prefer } }],
      filename: "a/b/c/from.ts",
      code: `import x from "@/c/to";`,
      output: `import x from "./to";`,
      moduleExists: ["./a/b/c/to"],
      errors: [
        {
          messageId: "rewrite",
          data: {
            value: "@/c/to",
            mostSuitable: "./to",
          },
        },
      ],
    });
  });
  /*
  - a
    - b(alias @/ means a/b/)
      - c
        - from.ts
      - d
        - to.ts
  */
  it("alias is placed at ancestor of LCA - deep", () => {
    const code = {
      [PREFER.closest]: `import x from "../d/to";`,
      [PREFER.relativeIfDescendant]: `import x from "@/d/to";`,
    };
    validTester({
      options: [{ paths: { "@/*": ["./a/b/*"] }, prefer: { "@/*": prefer } }],
      filename: "a/b/c/from.ts",
      code: code[prefer],
      moduleExists: ["./a/b/d/to"],
    });
  });
  it("alias is placed at ancestor of LCA - deep - invalid", () => {
    const importPath = {
      [PREFER.closest]: {
        from: "@/d/to",
        to: "../d/to",
      },
      [PREFER.relativeIfDescendant]: {
        from: "../d/to",
        to: "@/d/to",
      },
    }[prefer];
    invalidTester({
      options: [{ paths: { "@/*": ["./a/b/*"] }, prefer: { "@/*": prefer } }],
      filename: "a/b/c/from.ts",
      code: `import x from "${importPath.from}";`,
      output: `import x from "${importPath.to}";`,
      moduleExists: ["./a/b/d/to"],
      errors: [
        {
          messageId: "rewrite",
          data: {
            value: importPath.from,
            mostSuitable: importPath.to,
          },
        },
      ],
    });
  });
  /*
  - a
    - b(alias @/ means a/b/)
      - c
        - from.ts
      - d
        - e
          - f
            - to.ts
  */
  it("alias is placed at LCA - longer target branch", () => {
    const code = {
      [PREFER.closest]: `import x from "../../d/e/f/to";`,
      [PREFER.relativeIfDescendant]: `import x from "@/d/e/f/to";`,
    }[prefer];
    validTester({
      options: [{ paths: { "@/*": ["./a/b/*"] }, prefer: { "@/*": prefer } }],
      filename: "a/b/c/from.ts",
      code,
      moduleExists: ["./a/b/d/e/f/to"],
    });
  });
  it("alias is placed at LCA - longer target branch - invalid", () => {
    const importPath = {
      [PREFER.closest]: {
        from: "@/d/e/f/to",
        to: "../d/e/f/to",
      },
      [PREFER.relativeIfDescendant]: {
        from: "../d/e/f/to",
        to: "@/d/e/f/to",
      },
    }[prefer];
    invalidTester({
      options: [{ paths: { "@/*": ["./a/b/*"] }, prefer: { "@/*": prefer } }],
      filename: "a/b/c/from.ts",
      code: `import x from "${importPath.from}";`,
      output: `import x from "${importPath.to}";`,
      moduleExists: ["./a/b/d/e/f/to"],
      errors: [
        {
          messageId: "rewrite",
          data: {
            value: importPath.from,
            mostSuitable: importPath.to,
          },
        },
      ],
    });
  });
  /*
  - a
    - b(alias @/ means a/b/)
      - c
        - e
          - f
            - from.ts
      - d
        - to.ts
  */
  it("alias is placed at LCA - shorter target branch", () => {
    const code = {
      [PREFER.closest]: `import x from "@/d/to";`,
      [PREFER.relativeIfDescendant]: `import x from "@/d/to";`,
    }[prefer];
    validTester({
      options: [{ paths: { "@/*": ["./a/b/*"] }, prefer: { "@/*": prefer } }],
      filename: "a/b/c/e/f/from.ts",
      code,
      moduleExists: ["./a/b/d/to"],
    });
  });
  it("alias is placed at LCA - shorter target branch - invalid", () => {
    invalidTester({
      options: [{ paths: { "@/*": ["./a/b/*"] }, prefer: { "@/*": prefer } }],
      filename: "a/b/c/e/f/from.ts",
      code: `import x from "../../../d/to";`,
      output: `import x from "@/d/to";`,
      moduleExists: ["./a/b/d/to"],
      errors: [
        {
          messageId: "rewrite",
          data: {
            value: "../../../d/to",
            mostSuitable: "@/d/to",
          },
        },
      ],
    });
  });
});

describe("prefer-closest-import-path: not found", () => {
  it("valid", () => {
    validTester({
      options: DEFAULT_OPTIONS,
      filename: "src/deep/foo.ts",
      code: `import a from "../stubs/notfound";`,
      // report by no-unresolved or tsc
    });
  });
});

describe("prefer-closest-import-path: paths + baseUrl", () => {
  it("valid", () => {
    validTester({
      options: [{ paths: { "@x/*": ["src/stubs/*"] }, baseUrl: "./" }],
      filename: "src/foo.ts",
      code: `import a from "@x/a";`,
      moduleExists: ["./src/stubs/a"],
    });
  });
  it("invalid", () => {
    invalidTester({
      options: [{ paths: { "@x/*": ["src/stubs/*"] }, baseUrl: "./" }],
      filename: "src/foo.ts",
      code: `import a from "./stubs/a";`,
      output: `import a from "@x/a";`,
      moduleExists: ["./src/stubs/a"],
      errors: [
        {
          messageId: "rewrite",
          data: {
            value: "./stubs/a",
            mostSuitable: "@x/a",
          },
        },
      ],
    });
  });
});

describe("prefer-closest-import-path: rootDirs", () => {
  it("valid - basic", () => {
    validTester({
      options: [{ rootDirs: ["src", "generated"] }],
      filename: "src/foo.ts",
      code: `import a from "./stubs/a"; import b from "./stubs/b";`,
      moduleExists: ["./src/stubs/a", "./generated/stubs/b"],
    });
  });
  // 入れ子のケース
  it("valid - nested", () => {
    validTester({
      options: [{ rootDirs: ["src", "src/generated"] }],
      filename: "src/foo.ts",
      code: `import a from "./stubs/a"; import b from "./stubs/b";`,
      moduleExists: ["./src/stubs/a", "./src/generated/stubs/b"],
    });
  });
  it("invalid", () => {
    invalidTester({
      options: [{ rootDirs: ["src", "src/generated"] }],
      filename: "src/foo.ts",
      code: `import a from "./stubs/a"; import b from "./generated/stubs/b";`,
      output: `import a from "./stubs/a"; import b from "./stubs/b";`,
      moduleExists: ["./src/stubs/a", "./src/generated/stubs/b"],
      errors: [
        {
          messageId: "rewrite",
          data: {
            value: "./generated/stubs/b",
            mostSuitable: "./stubs/b",
          },
        },
      ],
    });
  });
});

describe("prefer-closest-import-path: alias to root", () => {
  it("valid: inner", () => {
    validTester({
      options: [{ paths: { "@/*": ["./src/*"] } }],
      filename: "src/deep/another/foo.ts",
      code: `import pkg from "../../../package.json";`,
      moduleExists: ["./package.json"],
    });
  });
  it("valid: root", () => {
    validTester({
      options: [{ paths: { "~/*": ["./*"] } }],
      filename: "src/deep/another/foo.ts",
      code: `import pkg from "~/package.json";`,
      moduleExists: ["./package.json"],
    });
  });
  it("invalid: root", () => {
    invalidTester({
      options: [{ paths: { "~/*": ["./*"] } }],
      filename: "src/deep/another/foo.ts",
      code: `import pkg from "../../../package.json";`,
      output: `import pkg from "~/package.json";`,
      moduleExists: ["./package.json"],
      errors: [
        {
          messageId: "rewrite",
          data: {
            value: "../../../package.json",
            mostSuitable: "~/package.json",
          },
        },
      ],
    });
  });
});

describe("prefer-closest-import-path: simplify path", () => {
  it("valid - simplify", () => {
    validTester({
      options: DEFAULT_OPTIONS,
      filename: "src/stubs/foo.ts",
      code: `import a from "../deep/a";`,
      moduleExists: ["./src/stubs/deep/a"],
    });
  });
  it("invalid - simplify", () => {
    invalidTester({
      options: DEFAULT_OPTIONS,
      filename: "src/stubs/foo.ts",
      code: `import a from "../stubs/deep/../deep/a";`,
      output: `import a from "./deep/a";`,
      moduleExists: ["./src/stubs/deep/a"],
      errors: [
        {
          messageId: "rewrite",
          data: {
            value: "../stubs/deep/../deep/a",
            mostSuitable: "./deep/a",
          },
        },
      ],
    });
  });
});

describe("prefer-closest-import-path: capture at middle", () => {
  it("valid: capture at middle", () => {
    validTester({
      options: [{ paths: { "@x/a/*": ["src/stubs/*/a"] }, baseUrl: "./" }],
      filename: "src/foo.ts",
      code: `import a from "@x/a/deep";`,
      moduleExists: ["./src/stubs/deep/a"],
    });
  });
  it("invalid: capture at middle", () => {
    invalidTester({
      options: [{ paths: { "@x/a/*": ["src/stubs/*/a"] }, baseUrl: "./" }],
      filename: "src/foo.ts",
      code: `import a from "./stubs/deep/a";`,
      output: `import a from "@x/a/deep";`,
      moduleExists: ["./src/stubs/deep/a"],
      errors: [
        {
          messageId: "rewrite",
          data: {
            value: "./stubs/deep/a",
            mostSuitable: "@x/a/deep",
          },
        },
      ],
    });
  });
});

describe("prefer-closest-import-path: samelevel multi patterns", () => {
  it.each([
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
      moduleExists: ["./src/stubs/deep/a"],
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
      moduleExists: ["./src/stubs/deep2/b"],
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
      moduleExists: ["./src/stubs/deep/a"],
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
      moduleExists: ["./src/stubs/deep/a"],
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
      moduleExists: ["./src/stubs/deep/a"],
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
      moduleExists: ["./src/stubs/deep2/b"],
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
      moduleExists: ["./src/stubs/deep-a/a"],
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
      moduleExists: ["./src/stubs/deep-a/a"],
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
      moduleExists: ["./src/stubs/deep/a"],
    },
  ])(
    "should be valid - filename: $filename, code: $code, options: $options",
    (arg) => {
      validTester(arg);
    },
  );
  it.each([
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
      moduleExists: ["./src/stubs/deep/a"],
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
      moduleExists: ["./src/stubs/deep2/b"],
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
      moduleExists: ["./src/stubs/deep/a"],
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
      moduleExists: ["./src/stubs/deep2/b"],
    },
  ])(
    "should be invalid - filename: $filename, code: $code, output: $output, options: $options",
    (arg) => {
      invalidTester(arg);
    },
  );
});

describe("prefer-closest-import-path: samelevel multi patterns - prefer relativeIfDescendant", () => {
  describe("feature", () => {
    it.each([
      {
        name: "internal cis pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/foo.ts",
        code: `import x from "@x/a";`,
        moduleExists: ["./src/stubs/deep/a"],
      },
      {
        name: "internal cis pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/foo.ts",
        code: `import x from "@x/b";`,
        moduleExists: ["./src/stubs/deep2/b"],
      },
      {
        name: "internal cis pattern 1(paths only)",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
            paths: { "@x/*": ["./src/stubs/deep/*", "./src/stubs/deep2/*"] },
          },
        ],
        filename: "src/stubs/deep/foo.ts",
        code: `import x from "@x/a";`,
        moduleExists: ["./src/stubs/deep/a"],
      },
    ])(
      "should be valid - $name - filename: $filename, code: $code, options: $options",
      (arg) => {
        validTester(arg);
      },
    );
    it.each([
      {
        name: "internal cis pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
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
        moduleExists: ["./src/stubs/deep/a"],
      },
      {
        name: "internal cis pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
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
        moduleExists: ["./src/stubs/deep2/b"],
      },
    ])(
      "should be invalid - $name - filename: $filename, code: $code, output: $output, options: $options",
      (arg) => {
        invalidTester(arg);
      },
    );
  });
  describe("regression", () => {
    it.each([
      {
        name: "internal(deep) cis pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
            paths: { "@x/*": ["src/stubs/deep-a/*", "src/stubs/deep-b/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep-a/deep-a/foo.ts",
        code: `import x from "../a";`,
        moduleExists: ["./src/stubs/deep-a/a"],
      },
      {
        name: "internal(deep) cis pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
            paths: { "@x/*": ["src/stubs/deep-a/*", "src/stubs/deep-b/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep-a/deep-a/foo.ts",
        code: `import x from "./a";`,
        moduleExists: ["./src/stubs/deep-a/a"],
      },
      {
        name: "internal trans pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep2/foo.ts",
        code: `import x from "@x/a";`,
        moduleExists: ["./src/stubs/deep/a"],
      },
      {
        name: "internal trans pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep/foo.ts",
        code: `import x from "@x/b";`,
        moduleExists: ["./src/stubs/deep2/b"],
      },
      {
        name: "internal(deep) trans pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
            paths: { "@x/*": ["src/stubs/deep-a/*", "src/stubs/deep-b/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep-b/deep-b/foo.ts",
        code: `import x from "@x/deep-a/a";`,
        moduleExists: ["./src/stubs/deep-a/a"],
      },
      {
        name: "internal(deep) trans pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
            paths: { "@x/*": ["src/stubs/deep-a/*", "src/stubs/deep-b/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/stubs/deep-b/deep-b/foo.ts",
        code: `import x from "@x/a";`,
        moduleExists: ["./src/stubs/deep-a/a"],
      },
      {
        name: "external",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
            paths: { "@x/*": ["src/stubs/deep/*", "src/stubs/deep2/*"] },
            baseUrl: "./",
          },
        ],
        filename: "src/dummy/foo.ts",
        code: `import x from "@x/a";`,
        moduleExists: ["./src/stubs/deep/a"],
      },
    ])(
      "should be valid - $name - filename: $filename, code: $code, options: $options",
      (arg) => {
        validTester(arg);
      },
    );
    it.each([
      {
        name: "internal trans pattern 1",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
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
        moduleExists: ["./src/stubs/deep/a"],
      },
      {
        name: "internal trans pattern 2",
        options: [
          {
            prefer: { "@x/*": PREFER.relativeIfDescendant },
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
        moduleExists: ["./src/stubs/deep2/b"],
      },
    ])(
      "should be invalid - $name - filename: $filename, code: $code, output: $output, options: $options",
      (arg) => {
        invalidTester(arg);
      },
    );
  });
});
