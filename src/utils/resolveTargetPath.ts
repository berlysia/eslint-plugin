import { join, relative, resolve } from "node:path";

type AliasPattern = string;
type AliasDestination = string;

function isMatch(path: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/*")) {
    return path.startsWith(pattern.slice(0, -1));
  }
  return path === pattern;
}

function resolveAlias(
  rootDir: string,
  path: string,
  aliasPattern: string,
  destPattern: string,
): string {
  if (aliasPattern === "*") {
    return relative(rootDir, join(destPattern, path));
  }
  if (aliasPattern.endsWith("/*")) {
    return relative(
      rootDir,
      join(
        destPattern.replace(/\/\*$/, ""),
        path.slice(aliasPattern.length - 1),
      ),
    );
  }
  return relative(rootDir, destPattern);
}

export default function resolveTargetPath(
  currentPath: string,
  targetPath: string,
  aliases: Record<AliasPattern, AliasDestination[]>,
  baseUrl: string,
): string[] {
  const ailiases = Object.keys(aliases);
  const simplifiedPath = relative(
    currentPath,
    resolve(currentPath, targetPath),
  );

  // fast path
  if (ailiases.length === 0) {
    return [simplifiedPath];
  }

  const aliasPattern = ailiases.find((pattern) => isMatch(targetPath, pattern));

  const aliasDestinations = aliasPattern
    ? (baseUrl
        ? aliases[aliasPattern].map((destination) =>
            resolve(baseUrl, destination),
          )
        : aliases[aliasPattern]
      ).map((destination) =>
        resolveAlias(baseUrl, targetPath, aliasPattern!, destination),
      )
    : [];

  const result = [simplifiedPath, ...aliasDestinations];

  return result;
}
