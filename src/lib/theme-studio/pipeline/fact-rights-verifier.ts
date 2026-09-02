export interface VerificationPolicyCheck {
  rightsCategory: string;
  policy: "strict" | "moderate" | "permissive";
  hasSourceUrl: boolean;
  hasTimestamp: boolean;
  sourceName?: string;
  sourceUrl?: string;
}

export interface VerificationResult {
  isCompliant: boolean;
  rightsPassed: boolean;
  provenancePassed: boolean;
  attributionRequired: boolean;
  attributionText?: string;
  violations: string[];
}

const STRICT_ALLOWED_RIGHTS = new Set([
  "owned",
  "public_domain",
  "cc_by",
  "cc_by_sa",
  "commercial_license",
]);

const MODERATE_ALLOWED_RIGHTS = new Set([
  "owned",
  "public_domain",
  "cc_by",
  "cc_by_sa",
  "commercial_license",
  "fair_use_commentary",
]);

/**
 * Validates a story against the page's rights policy and factual provenance rules.
 */
export function verifyRightsAndProvenance(check: VerificationPolicyCheck): VerificationResult {
  const { rightsCategory, policy, hasSourceUrl, hasTimestamp, sourceName, sourceUrl } = check;
  const violations: string[] = [];

  let rightsPassed = false;
  let attributionRequired = false;

  if (policy === "strict") {
    rightsPassed = STRICT_ALLOWED_RIGHTS.has(rightsCategory);
    if (!rightsPassed) {
      violations.push(`Rights category "${rightsCategory}" is blocked under strict policy.`);
    }
    attributionRequired = ["cc_by", "cc_by_sa"].includes(rightsCategory);
  } else if (policy === "moderate") {
    rightsPassed = MODERATE_ALLOWED_RIGHTS.has(rightsCategory);
    if (!rightsPassed) {
      violations.push(`Rights category "${rightsCategory}" is restricted.`);
    }
    attributionRequired = true;
  } else {
    // permissive
    rightsPassed = true;
    attributionRequired = true;
  }

  let provenancePassed = true;
  if (!hasSourceUrl) {
    violations.push("Missing verified source URL for factual claim.");
    provenancePassed = false;
  }
  if (!hasTimestamp) {
    violations.push("Missing publication timestamp on source item.");
    provenancePassed = false;
  }

  const isCompliant = rightsPassed && provenancePassed;
  let sourceIdentity = sourceName;
  if (sourceUrl && sourceName) {
    sourceIdentity = `${sourceName} (${sourceUrl})`;
  } else if (sourceUrl) {
    sourceIdentity = sourceUrl;
  } else if (!sourceIdentity) {
    sourceIdentity = "Verified source";
  }

  return {
    isCompliant,
    rightsPassed,
    provenancePassed,
    attributionRequired,
    attributionText: attributionRequired ? `Source: ${sourceIdentity} [${rightsCategory.toUpperCase()}]` : undefined,
    violations,
  };
}
