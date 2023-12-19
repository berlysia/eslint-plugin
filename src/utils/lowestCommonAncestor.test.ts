import { test, expect } from "vitest";
import lowestCommonAncestor from "./lowestCommonAncestor";

test("'/foo/bar', '/foo/baz')).toBe('/foo'", () => {
  expect(lowestCommonAncestor("/foo/bar", "/foo/baz")).toBe("/foo");
});

test("'/foo/bar', '/foo/bar')).toBe('/foo/bar'", () => {
  expect(lowestCommonAncestor("/foo/bar", "/foo/bar")).toBe("/foo/bar");
});

test("'/foo/bar', '/foo/bar/baz')).toBe('/foo/bar'", () => {
  expect(lowestCommonAncestor("/foo/bar", "/foo/bar/baz")).toBe("/foo/bar");
});

test("'/foo/bar/baz', '/foo/bar')).toBe('/foo/bar'", () => {
  expect(lowestCommonAncestor("/foo/bar/baz", "/foo/bar")).toBe("/foo/bar");
});

test("'./foo/bar', './foo/baz')).toBe('./foo'", () => {
  expect(lowestCommonAncestor("./foo/bar", "./foo/baz")).toBe("./foo");
});
