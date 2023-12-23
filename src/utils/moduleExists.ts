import resolvePkg from "resolve";

export function moduleExists(path: string) {
  try {
    resolvePkg.sync(path);
    return true;
  } catch {
    return false;
  }
}
