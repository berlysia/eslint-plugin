const starPattern = /\*/g;
function getStarCount(pattern: string) {
  const matched = pattern.match(starPattern);
  return matched?.length ?? 0;
}

function hasValidStarCount(pattern: string) {
  return getStarCount(pattern) <= 1;
}

type StarPattern = {
  type: "star";
  prefix: string;
  suffix: string;
};
type ExactPattern = {
  type: "exact";
  value: string;
};

type ParsedPattern = StarPattern | ExactPattern;

function parsePattern(pattern: string): ParsedPattern {
  const starCount = getStarCount(pattern);
  if (starCount === 0) {
    return { type: "exact", value: pattern };
  }
  const [prefix, suffix] = pattern.split("*");
  return { type: "star", prefix, suffix };
}
function isPattarnMatched(pattern: ParsedPattern, target: string) {
  if (pattern.type === "exact") {
    return pattern.value === target;
  }
  const { prefix, suffix } = pattern;
  return target.startsWith(prefix) && target.endsWith(suffix);
}

function rewriteByPattern<T extends ParsedPattern>(
  matchPattern: T,
  target: string,
  aliasPattern: T,
) {
  if (matchPattern.type === "exact" && aliasPattern.type === "exact") {
    return aliasPattern.value;
  }

  if (matchPattern.type === "star" && aliasPattern.type === "star") {
    return (
      aliasPattern.prefix +
      target.slice(
        matchPattern.prefix.length,
        target.length - matchPattern.suffix.length,
      ) +
      aliasPattern.suffix
    );
  }

  throw new Error("Invalid pattern");
}

export function matchAlias(
  given: string,
  paths: Record<string, string[]>,
): string[] {
  const aliasAndPatterns = Object.entries(paths);

  return aliasAndPatterns.flatMap(([alias, patterns]) => {
    if (!hasValidStarCount(alias)) return [];
    const parsedAlias = parsePattern(alias);

    if (!isPattarnMatched(parsedAlias, given)) {
      return [];
    }

    return patterns.flatMap((pattern) => {
      if (!hasValidStarCount(pattern)) return [];

      const parsedPattern = parsePattern(pattern);

      return [rewriteByPattern(parsedAlias, given, parsedPattern)];
    });
  });
}

export function assumeAlias(
  given: string,
  paths: Record<string, string[]>,
): { alias: string; rewritten: string }[] {
  const aliasAndPatterns = Object.entries(paths);
  return aliasAndPatterns.flatMap(([alias, patterns]) => {
    if (!hasValidStarCount(alias)) return [];
    const parsedAlias = parsePattern(alias);

    return patterns.flatMap((pattern) => {
      if (!hasValidStarCount(pattern)) return [];

      const parsedPattern = parsePattern(pattern);
      const matched = isPattarnMatched(parsedPattern, given);
      if (!matched) return [];

      return [
        {
          alias,
          rewritten: rewriteByPattern(parsedPattern, given, parsedAlias),
        },
      ];
    });
  });
}
