import resolvePkg from "resolve";

export function moduleExists(path: string) {
  try {
    return resolvePkg.sync(path);
  } catch {
    return false;
  }
}
