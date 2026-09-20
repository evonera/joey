export type PackagingIssue = {
  type:
    | "length"
    | "desktop-cut"
    | "mobile-cut"
    | "shouting"
    | "vague"
    | "no-number"
    | "front-load"
    | "duplicate"
    | "thumb-length";
  message: string;
  severity: "warning" | "critical";
};

export type PackagingLintResult = {
  title: string;
  thumbnailText?: string;
  charCount: number;
  score: number;
  issues: Array<PackagingIssue>;
  good: Array<string>;
  mobileSnippet: string;
  desktopSnippet: string;
};

const HARD_CUTOFF = 100;
const DESKTOP_CUTOFF = 70;
const MOBILE_CUTOFF = 50;

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't",
  "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during",
  "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
  "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i",
  "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's",
  "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself",
  "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought",
  "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", "she",
  "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
  "than", "that", "that's", "the", "their", "theirs", "them", "themselves",
  "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
  "they've", "this", "those", "through", "to", "too", "under", "until", "up",
  "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
  "weren't", "what", "what's", "when", "when's", "where", "where's", "which",
  "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves",
]);

const VAGUE_WORDS = new Set([
  "things", "thing", "stuff", "crazy", "insane", "amazing", "awesome", "cool",
  "great", "random", "interesting", "best", "worst", "unbelievable",
]);

function extractWords(s: string): Array<string> {
  const matches = s.toLowerCase().match(/\b[a-z0-9]+(?:'[a-z]+)?\b/g);
  return matches ?? [];
}

export function lintPackaging(title: string, thumbnailText?: string): PackagingLintResult {
  const t = title.trim();
  const n = t.length;
  const issues: Array<PackagingIssue> = [];
  const good: Array<string> = [];

  const titleWords = extractWords(t);

  if (n > HARD_CUTOFF) {
    issues.push({
      type: "length",
      message: `${n} characters — exceeds maximum recommended hook ceiling`,
      severity: "critical",
    });
  } else if (n > DESKTOP_CUTOFF) {
    issues.push({
      type: "desktop-cut",
      message: `${n} characters — desktop feed truncates around 60 characters`,
      severity: "warning",
    });
  } else if (n > 0) {
    good.push(`${n} characters, clean within the 60-character desktop cut`);
  }

  const mobileSnippet = n > MOBILE_CUTOFF ? t.slice(0, MOBILE_CUTOFF).replace(/\s+\S*$/, "") : t;
  const desktopSnippet = n > DESKTOP_CUTOFF ? t.slice(0, DESKTOP_CUTOFF).replace(/\s+\S*$/, "") : t;

  if (n > MOBILE_CUTOFF) {
    issues.push({
      type: "mobile-cut",
      message: `Mobile feed truncates to "${mobileSnippet}..." — ensure core subject survives`,
      severity: "warning",
    });
  } else if (n > 0) {
    good.push("Front-loaded and fully visible on mobile feeds (<40 characters)");
  }

  const rawWords = t.split(/\s+/).filter(Boolean);
  const allCapsWords = rawWords.filter(
    (w) => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w),
  );
  if (allCapsWords.length > 2) {
    issues.push({
      type: "shouting",
      message: `${allCapsWords.length} all-caps words — two is the ceiling before looking like spam`,
      severity: "warning",
    });
  } else if (allCapsWords.length > 0) {
    good.push(`${allCapsWords.length} all-caps word for punchy emphasis`);
  }

  const vagueFound = titleWords.filter((w) => VAGUE_WORDS.has(w));
  if (vagueFound.length > 0) {
    const uniqueVague = Array.from(new Set(vagueFound));
    issues.push({
      type: "vague",
      message: `Vague word (${uniqueVague.join(", ")}) — swap for a concrete number, metric, or specific name`,
      severity: "warning",
    });
  }

  const hasNumbers = /\d[\d,.]*%?/.test(t);
  if (hasNumbers) {
    good.push("Carries concrete numbers or data figures");
  } else if (n > 0) {
    issues.push({
      type: "no-number",
      message: "No numbers, dates, or data points — adding a specific figure significantly boosts CTR",
      severity: "warning",
    });
  }

  if (t.endsWith("?")) {
    good.push("Open question format creates an irresistible curiosity gap");
  }

  const frontThree = titleWords.slice(0, 3).filter((w) => !STOP_WORDS.has(w));
  if (frontThree.length === 0 && titleWords.length >= 3) {
    issues.push({
      type: "front-load",
      message: "First three words are all filler/stop words — move the subject to the very front",
      severity: "warning",
    });
  }

  if (thumbnailText && thumbnailText.trim()) {
    const thumbWords = extractWords(thumbnailText);
    const titleNonStop = new Set(titleWords.filter((w) => !STOP_WORDS.has(w)));
    const thumbNonStop = new Set(thumbWords.filter((w) => !STOP_WORDS.has(w)));

    const shared = Array.from(titleNonStop).filter((w) => thumbNonStop.has(w));
    if (shared.length > 0) {
      issues.push({
        type: "duplicate",
        message: `Visual repeats hook on "${shared.join(", ")}" — visual graphic should say what the title does not!`,
        severity: "critical",
      });
    } else {
      good.push("Visual graphic and title use complementary words without wasteful duplication");
    }

    if (thumbWords.length > 3) {
      issues.push({
        type: "thumb-length",
        message: `${thumbWords.length} words on visual — 3 words is the recommended ceiling at feed size`,
        severity: "warning",
      });
    } else if (thumbWords.length > 0) {
      good.push(`${thumbWords.length} words on visual — ideal high-CTR feed readability`);
    }
  }

  const score =
    n === 0
      ? 0
      : Math.max(0, Math.min(100, Math.round(100 - 14 * issues.length + 4 * good.length)));

  return {
    title: t,
    thumbnailText: thumbnailText?.trim(),
    charCount: n,
    score,
    issues,
    good,
    mobileSnippet,
    desktopSnippet,
  };
}
