import { isAbsolute } from "node:path";

export default function normalizePath(path: string) {
  if (isAbsolute(path)) {
    return path;
  }
  if (path.startsWith("./") || path.startsWith("../")) {
    return path;
  }
  return `./${path}`;
}
