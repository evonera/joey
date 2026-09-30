export function scoutFactReviewRequired(provenance: unknown): boolean {
  return Boolean(provenance && typeof provenance === "object" && "requiresFactReview" in provenance && provenance.requiresFactReview === true);
}

export function scoutRenderableFacts(facts: unknown, provenance: unknown): Array<{ claim: string }> {
  const isScout = Boolean(provenance && typeof provenance === "object" && "scoutId" in provenance);
  return Array.isArray(facts) ? facts.filter((fact): fact is { claim: string } => {
    if (!fact || typeof fact !== "object" || typeof fact.claim !== "string") return false;
    return !isScout || fact.corroborationStatus === "corroborated";
  }).slice(0, 3) : [];
}
