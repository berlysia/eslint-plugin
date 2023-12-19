export default function lowestCommonAncestor(a: string, b: string): string {
  const aParts = a.split("/");
  const bParts = b.split("/");
  let i = 0;
  while (i < aParts.length && i < bParts.length && aParts[i] === bParts[i]) {
    i++;
  }
  return aParts.slice(0, i).join("/");
}
