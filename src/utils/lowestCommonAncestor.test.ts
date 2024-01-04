import { test, expect } from "vitest";
import lowestCommonAncestor from "./lowestCommonAncestor";

test.each([
  { a: "/foo/bar", b: "/foo/baz", expected: "/foo" },
  { a: "/foo/bar", b: "/foo/bar", expected: "/foo/bar" },
  { a: "/foo/bar", b: "/foo/bar/baz", expected: "/foo/bar" },
  { a: "/foo/bar/baz", b: "/foo/bar", expected: "/foo/bar" },
  { a: "./foo/bar", b: "./foo/baz", expected: "./foo" },
])(`lowestCommonAncestor(%a, %b) => $expected`, ({ a, b, expected }) => {
  expect(lowestCommonAncestor(a, b)).toBe(expected);
});
