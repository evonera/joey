// Fail closed on non-stable releases or complex ranges: changing core runtime
// requirements should trigger an explicit compatibility review.
export function satisfiesStableCaret(actual, range) {
  const minimum = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range ?? "");
  const resolved = /^(\d+)\.(\d+)\.(\d+)$/.exec(actual ?? "");
  if (!minimum || !resolved) return false;
  const [major, minor, patch] = minimum.slice(1).map(Number);
  const [resolvedMajor, resolvedMinor, resolvedPatch] = resolved.slice(1).map(Number);
  const atLeastMinimum = resolvedMajor > major ||
    (resolvedMajor === major && (resolvedMinor > minor ||
      (resolvedMinor === minor && resolvedPatch >= patch)));
  const belowNextBreaking = major > 0 ? resolvedMajor === major :
    minor > 0 ? resolvedMajor === 0 && resolvedMinor === minor :
      resolvedMajor === 0 && resolvedMinor === 0 && resolvedPatch === patch;
  return atLeastMinimum && belowNextBreaking;
}
