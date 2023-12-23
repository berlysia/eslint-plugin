import { isAbsolute } from "node:path";
import slash from "slash";

export default function normalizePath(given: string) {
  const wrap = slash(given);
  if (isAbsolute(wrap)) {
    return wrap;
  }
  if (wrap.startsWith("./") || wrap.startsWith("../")) {
    return wrap;
  }
  return `./${wrap}`;
}
