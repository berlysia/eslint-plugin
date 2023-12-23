import { test, expect } from "vitest";
import resolveTargetPath from "./resolveTargetPath";

test("noop", () => {
  expect(
    resolveTargetPath(
      "src/test.ts",
      "src/utils/normalizeTargetPath/normalizeTargetPath.test.ts",
      {},
      "./",
    ),
  ).toMatchInlineSnapshot(`
    [
      "src/utils/normalizeTargetPath/normalizeTargetPath.test.ts",
    ]
  `);
});

test("@/* => src/*", () => {
  expect(
    resolveTargetPath(
      "src/test.ts",
      "@/utils/normalizeTargetPath/normalizeTargetPath.test.ts",
      {
        "@/*": ["src/*"],
      },
      "./",
    ),
  ).toMatchInlineSnapshot(`
    [
      "@/utils/normalizeTargetPath/normalizeTargetPath.test.ts",
      "src/utils/normalizeTargetPath/normalizeTargetPath.test.ts",
    ]
  `);
});

test("@/* => src/*, @utils/* => src/utils/*, @/*", () => {
  expect(
    resolveTargetPath(
      "src/test.ts",
      "@/utils/normalizeTargetPath/normalizeTargetPath.test.ts",
      {
        "@/*": ["src/*"],
        "@utils/*": ["src/utils/*"],
      },
      "./",
    ),
  ).toMatchInlineSnapshot(`
    [
      "@/utils/normalizeTargetPath/normalizeTargetPath.test.ts",
      "src/utils/normalizeTargetPath/normalizeTargetPath.test.ts",
    ]
  `);
});

test("@/* => src/*, @utils/* => src/utils/*, @utils/*", () => {
  expect(
    resolveTargetPath(
      "src/test.ts",
      "@utils/normalizeTargetPath/normalizeTargetPath.test.ts",
      {
        "@/*": ["src/*"],
        "@utils/*": ["src/utils/*"],
      },
      "./",
    ),
  ).toMatchInlineSnapshot(`
    [
      "@utils/normalizeTargetPath/normalizeTargetPath.test.ts",
      "src/utils/normalizeTargetPath/normalizeTargetPath.test.ts",
    ]
  `);
});

test("@/* => src/*, @utils/* => src/utils/*, attack", () => {
  expect(
    resolveTargetPath(
      "src/test.ts",
      "@utilsx/normalizeTargetPath/normalizeTargetPath.test.ts",
      {
        "@/*": ["src/*"],
        "@utils/*": ["src/utils/*"],
      },
      "./",
    ),
  ).toMatchInlineSnapshot(`
    [
      "@utilsx/normalizeTargetPath/normalizeTargetPath.test.ts",
    ]
  `);
});

test("@/* => src/*, @utils/* => src/rules/*, @utils/* => src/utils/*", () => {
  expect(
    resolveTargetPath(
      "src/test.ts",
      "@utils/normalizeTargetPath/normalizeTargetPath.test.ts",
      {
        "@/*": ["src/*"],
        "@utils/*": ["src/rules/*", "src/utils/*"],
      },
      "./",
    ),
  ).toMatchInlineSnapshot(`
    [
      "@utils/normalizeTargetPath/normalizeTargetPath.test.ts",
      "src/rules/normalizeTargetPath/normalizeTargetPath.test.ts",
      "src/utils/normalizeTargetPath/normalizeTargetPath.test.ts",
    ]
  `);
});
