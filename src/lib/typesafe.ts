import { TypeSafeClient, choice, type ChoiceCriteria } from "@typesafe-ai/sdk";

export interface DmRuleCandidate {
  id: string;
  triggerValue: string;
  triggerType?: string;
  responseTemplate?: string;
  responseLink?: string | null;
  stats?: unknown;
}

/**
 * Resolves the TypeSafe API key for a tenant (BYOK from api_keys first, then process.env).
 */
export async function resolveTypesafeApiKey(tenantId?: string | null): Promise<string | null> {
  if (tenantId) {
    try {
      const { db } = await import("@/lib/db");
      const { apiKeys } = await import("@/lib/db/schema");
      const { and, eq } = await import("drizzle-orm");
      const { decrypt } = await import("@/lib/crypto");

      const keyRow = await db.query.apiKeys.findFirst({
        where: and(
          eq(apiKeys.tenantId, tenantId),
          eq(apiKeys.provider, "typesafe"),
          eq(apiKeys.status, "active"),
        ),
      });

      if (keyRow) {
        if (!keyRow.encryptedKey) {
          console.warn(`[typesafe] Active tenant key row found for tenant ${tenantId} but encryptedKey is empty`);
          return null;
        }
        return decrypt(keyRow.encryptedKey, tenantId);
      }
    } catch (err) {
      console.error(`[typesafe] Failed to read/decrypt configured BYOK key for tenant ${tenantId}:`, err);
      // Do not silently mask a broken tenant credential by falling back to process.env
      return null;
    }
  }

  return process.env.TYPESAFE_API_KEY || null;
}

/**
 * Returns an authenticated TypeSafeClient instance with configurable timeout (default 2500ms).
 */
export async function getTypesafeClient(
  tenantId?: string | null,
  options?: { timeout?: number },
): Promise<TypeSafeClient | null> {
  const apiKey = await resolveTypesafeApiKey(tenantId);
  if (!apiKey) return null;

  return new TypeSafeClient({
    apiKey,
    timeout: options?.timeout ?? 2500,
  });
}

// ---------------------------------------------------------------------------
// Cautious Jev guards: feature flags, budget caps, structured logging.
// Jev is cheap per-call but compounds across Scouts, comments, and flows.
// Only Scout pre-gate + DM fallback are enabled by default. Clustering
// defaults to OFF (opt-in shadow with strict sampling).
// ---------------------------------------------------------------------------

export type JevFeature = "scout" | "dm" | "cluster" | "decision";
export type ClusteringMode = "shadow" | "active" | "off";

export function getClusteringMode(override?: string | null): ClusteringMode {
  const raw = (override ?? process.env.THEME_STUDIO_CLUSTERING_MODE ?? "off")
    .toString()
    .trim()
    .toLowerCase();
  if (raw === "active" || raw === "shadow" || raw === "off") return raw;
  return "off";
}

export function isJevFeatureEnabled(feature: JevFeature): boolean {
  if (feature === "scout") return process.env.TYPESAFE_SCOUT_GATE !== "false";
  if (feature === "dm") return process.env.TYPESAFE_DM_FALLBACK !== "false";
  if (feature === "cluster") return getClusteringMode() !== "off";
  return true; // decision node: allowed only when user explicitly adds it
}

export function getJevCaps(): { daily: number; monthly: number } {
  const daily = Number.parseInt(process.env.JEV_DAILY_CAP ?? "500", 10);
  const monthly = Number.parseInt(process.env.JEV_MONTHLY_CAP ?? "10000", 10);
  return {
    daily: Number.isFinite(daily) && daily > 0 ? daily : 500,
    monthly: Number.isFinite(monthly) && monthly > 0 ? monthly : 10000,
  };
}

interface JevBudgetState {
  day: string;
  dayCount: number;
  month: string;
  monthCount: number;
}

const jevBudgetMemory = new Map<string, JevBudgetState>();

export function resetJevBudgetForTests(): void {
  jevBudgetMemory.clear();
}

/** In-memory tenant budget check. DB event log is best-effort (see recordJevUsage). */
export function checkJevBudget(tenantId?: string | null): {
  allowed: boolean;
  reason?: string;
} {
  const caps = getJevCaps();
  if (!tenantId) return { allowed: true };
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);
  const state = jevBudgetMemory.get(tenantId);
  if (!state || state.day !== day) {
    jevBudgetMemory.set(tenantId, {
      day,
      dayCount: state?.day === day ? state.dayCount : 0,
      month: state?.month === month ? state.month : month,
      monthCount: state?.month === month ? state.monthCount : 0,
    });
  }
  const current = jevBudgetMemory.get(tenantId)!;
  if (current.dayCount >= caps.daily) {
    return { allowed: false, reason: `daily cap ${caps.daily} reached` };
  }
  if (current.monthCount >= caps.monthly) {
    return { allowed: false, reason: `monthly cap ${caps.monthly} reached` };
  }
  return { allowed: true };
}

export function passesJevThresholds(
  confidence: number,
  probability: number,
  minConfidence: number,
  minProbability: number,
): boolean {
  return confidence >= minConfidence && probability >= minProbability;
}

export interface JevLogFields {
  feature: JevFeature;
  tenantId?: string | null;
  latencyMs: number;
  confidence?: number;
  probability?: number;
  fallbackReason?: string;
  triggered?: boolean;
}

export function logJevCall(fields: JevLogFields): void {
  console.info(
    JSON.stringify({
      event: "jev_call",
      ...fields,
    }),
  );
}

/** Best-effort persistent usage event (kind='jev'). Never throws. */
export async function recordJevUsage(args: {
  tenantId?: string | null;
  feature: JevFeature;
  latencyMs: number;
  confidence?: number;
  probability?: number;
  fallbackReason?: string;
  modelId?: string;
  triggered?: boolean;
}): Promise<void> {
  const { tenantId, feature, latencyMs, confidence, probability, fallbackReason, modelId, triggered } = args;
  // In-memory cap accounting (works even when DB is mocked/unavailable).
  if (tenantId) {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const month = now.toISOString().slice(0, 7);
    const prev = jevBudgetMemory.get(tenantId) ?? { day, dayCount: 0, month, monthCount: 0 };
    jevBudgetMemory.set(tenantId, {
      day,
      dayCount: (prev.day === day ? prev.dayCount : 0) + 1,
      month,
      monthCount: (prev.month === month ? prev.monthCount : 0) + 1,
    });
  }
  logJevCall({ feature, tenantId, latencyMs, confidence, probability, fallbackReason, triggered });
  try {
    const { db } = await import("@/lib/db");
    const { agentUsageEvents } = await import("@/lib/db/schema");
    const { randomUUID } = await import("node:crypto");
    await db
      .insert(agentUsageEvents)
      .values({
        id: randomUUID(),
        tenantId: tenantId ?? "unknown",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: "0",
        kind: "jev",
        modelId: modelId ?? "jev",
        metadata: { feature, latencyMs, confidence, probability, fallbackReason, triggered },
      })
      .onConflictDoNothing({ target: agentUsageEvents.id });
  } catch {
    // Best-effort only: in-memory counters + log line above are the source of truth in tests.
  }
}

export interface ThemePageContext {
  name?: string | null;
  niche?: string | null;
  audience?: string | null;
}

/**
 * Fast multi-lingual intent filter. Tests if a comment exhibits inquiry or request markers
 * across English, Spanish, Portuguese, French, German, Italian, Hindi/Hinglish, and Indonesian.
 * Drops purely conversational, emoji-only, or vanity praise comments locally in 0ms before calling Jev.
 */
export function hasCommentIntentMarkers(commentText: string, customKeywords: string[] = []): boolean {
  if (!commentText || !commentText.trim()) return false;

  // 1. Any question punctuation across languages (English, Spanish, Greek, Arabic, etc.)
  if (/[?¿؟]/.test(commentText)) return true;

  // 2. Check if any rule's specific trigger keyword is present anywhere in the comment
  const lower = commentText.toLowerCase();
  for (const kw of customKeywords) {
    if (kw && lower.includes(kw.toLowerCase())) return true;
  }

  // 3. Multi-lingual request verbs, question words, and offer markers
  // Uses Unicode letter lookaround (?<!\p{L}) and (?!\p{L}) rather than ASCII \b so non-ASCII words like "où" match properly
  const INTENT_MARKERS_REGEX = new RegExp(
    "(?<!\\p{L})(" +
      [
        // Universal & English: questions, request verbs, resource nouns
        "how|where|what|which|can|could|would|will|send|sent|dm|pm|link|links|drop|share|get|got|want|wants|need|needs|please|pls|plz|info|information|details|price|cost|how much|code|coupon|discount|template|sheet|recipe|guide|pdf|ebook|download|access|free|source|tutorial|step|steps|checkout|buy|purchase|order",
        // Spanish: ¿dónde, cómo, enviar, mandar, enlace, quiero, receta, guía, precio, por favor...
        "donde|dónde|como|cómo|cual|cuál|cuanto|cuánto|enviar|envia|envía|enviame|envíame|manda|mandame|mándame|pasa|pasame|pásame|enlace|quiero|necesito|info|informacion|información|detalles|precio|receta|guia|guía|plantilla|cupon|cupón|descuento|por favor|xfa",
        // Portuguese: onde, como, mandar, me manda, link, quero, preço, receita, guia, por favor...
        "onde|como|qual|quanto|enviar|envia|enviame|manda|mandame|me manda|mande|passa|passame|quero|preciso|info|informacao|informações|preco|preço|receita|guia|modelo|cupom|desconto|por favor|pfv|pfr",
        // French: comment, où, envoyer, lien, je veux, prix, recette, guide, svp...
        "comment|ou|où|quel|combien|envoyer|envoie|envoiemoi|partager|lien|veux|besoin|infos|information|prix|recette|guide|modele|modèle|reduction|réduction|svp|stp",
        // German: wie, wo, schicken, schick, bitte, link, rezept, rabatt...
        "wie|wo|welche|wieviel|schicken|schick|sende|will|brauche|infos|kosten|rezept|anleitung|vorlage|rabatt|gutschein|bitte",
        // Italian: come, dove, mandare, manda, voglio, ricetta, guida, sconto...
        "come|dove|quale|quanto|mandare|manda|mandami|inviare|invia|inviami|voglio|bisogno|informazioni|prezzo|ricetta|guida|modello|sconto|codice|per favore",
        // Hindi / Hinglish: bhejo, bhejna, kahan, kaise, chahiye, dedo, batana...
        "bhejo|bhejna|kahan|kaise|chahiye|dedo|batao|batana|kitna|dam",
        // Indonesian / Malay: gimana, cara, kirim, bagi, mau, info, resep, panduan...
        "gimana|cara|kirim|bagi|mau|butuh|harga|resep|panduan|diskon|tolong",
      ].join("|") +
      ")(?!\\p{L})",
    "iu",
  );

  return INTENT_MARKERS_REGEX.test(commentText);
}

/**
 * Evaluates an incoming comment against active DM automation rules using TypeSafe's Jev System One model.
 * Employs a zero-cost local multilingual intent pre-filter to drop non-inquiries before calling Jev.
 * Returns the matching rule if confidence is high (>= 0.85), or null if no rule matches or on error.
 */
export async function matchCommentRuleSemantically<T extends DmRuleCandidate>(
  commentText: string,
  rules: T[],
  tenantId?: string | null,
  options?: {
    confidenceThreshold?: number;
    probabilityThreshold?: number;
    client?: TypeSafeClient;
    pageContext?: ThemePageContext;
  },
): Promise<T | null> {
  if (!commentText || !commentText.trim() || rules.length === 0) {
    return null;
  }

  // 0-Cost Local Pre-Filter: Drop comments that lack inquiry markers, question marks, or rule keywords
  const customKeywords = rules.map((r) => r.triggerValue);
  if (!hasCommentIntentMarkers(commentText, customKeywords)) {
    return null;
  }

  if (!isJevFeatureEnabled("dm")) {
    return null;
  }
  const budget = checkJevBudget(tenantId);
  if (!budget.allowed) {
    await recordJevUsage({
      tenantId,
      feature: "dm",
      latencyMs: 0,
      fallbackReason: budget.reason ?? "budget exceeded",
    });
    return null;
  }

  const client = options?.client ?? (await getTypesafeClient(tenantId));
  if (!client) {
    return null;
  }

  const confidenceThreshold = options?.confidenceThreshold ?? 0.85;
  const probabilityThreshold = options?.probabilityThreshold ?? 0.75;

  const criteria: ChoiceCriteria = {};
  for (const rule of rules) {
    const concept = rule.triggerValue.toLowerCase();
    const templateSnippet = rule.responseTemplate
      ? rule.responseTemplate
          .replace(/\{\{[^}]+\}\}/g, "")
          .replace(/https?:\/\/\S+/g, "")
          .trim()
          .slice(0, 80)
      : "";
    const hint = templateSnippet ? ` (delivering: "${templateSnippet}")` : "";
    criteria[`rule_${rule.id}`] =
      `The commenter is specifically requesting, asking for, or showing interest in the "${concept}" offer${hint}`;
  }
  criteria["none"] =
    "The commenter is not requesting any of these specific resources (general reaction, compliments, emoji, casual remark, praise, or unrelated comment)";

  try {
    const startedAt = Date.now();
    const response = await client.systemOne({
      state: {
        comment: commentText.trim(),
        ...(options?.pageContext
          ? {
              page: {
                name: options.pageContext.name || null,
                niche: options.pageContext.niche || null,
                audience: options.pageContext.audience || null,
              },
            }
          : {}),
      },
      questions: {
        intent: choice(
          "Which resource, action, or offer is the commenter requesting from the author, if any?",
          criteria,
        ),
      },
    });

    const answer = response.answers.intent;
    const latencyMs = Date.now() - startedAt;
    if (!answer || answer.choice === "none") {
      await recordJevUsage({
        tenantId,
        feature: "dm",
        latencyMs,
        confidence: answer?.confidence,
        probability: answer ? (answer.probabilities[answer.choice] ?? 0) : undefined,
        fallbackReason: !answer ? "no-answer" : "choice-none",
        modelId: (response as { model?: string }).model ?? "jev",
      });
      return null;
    }

    const selectedProbability = answer.probabilities[answer.choice] ?? 0;
    if (!passesJevThresholds(answer.confidence, selectedProbability, confidenceThreshold, probabilityThreshold)) {
      await recordJevUsage({
        tenantId,
        feature: "dm",
        latencyMs,
        confidence: answer.confidence,
        probability: selectedProbability,
        fallbackReason: "below-threshold",
        modelId: (response as { model?: string }).model ?? "jev",
      });
      return null;
    }

    const matchedRuleId = answer.choice.replace(/^rule_/, "");
    const matched = rules.find((r) => r.id === matchedRuleId) ?? null;
    await recordJevUsage({
      tenantId,
      feature: "dm",
      latencyMs,
      confidence: answer.confidence,
      probability: selectedProbability,
      modelId: (response as { model?: string }).model ?? "jev",
    });
    return matched;
  } catch (error) {
    console.warn("[typesafe] Semantic DM match failed gracefully:", error);
    await recordJevUsage({
      tenantId,
      feature: "dm",
      latencyMs: 0,
      fallbackReason: error instanceof Error ? error.message.slice(0, 200) : "provider-error",
    });
    return null;
  }
}

export type StoryRelationship = "same_event" | "related_topic" | "unrelated";
export type StoryCorroboration = "corroborates" | "neutral_or_additive" | "contradicts";

export interface StoryAffinityResult {
  relationship: StoryRelationship;
  relationshipConfidence: number;
  relationshipProbability: number;
  corroboration: StoryCorroboration;
  corroborationConfidence: number;
  corroborationProbability: number;
}

export interface StoryArticleInput {
  id?: string;
  title?: string | null;
  body?: string | null;
}

/**
 * Evaluates the semantic affinity and fact corroboration between two news/feed stories
 * using TypeSafe's Jev System One model.
 *
 * Runs two parallel questions:
 * 1. relationship: Does candidate report on the exact same event, a related topic, or an unrelated topic?
 * 2. corroboration: Does candidate corroborate, add supplementary context, or contradict key claims?
 */
export async function evaluateStoryAffinitySemantically(
  primary: StoryArticleInput,
  candidate: StoryArticleInput,
  tenantId?: string | null,
  options?: {
    client?: TypeSafeClient;
    pageContext?: ThemePageContext;
    /** Set by clusterSourceItems when mode is explicitly shadow/active (mode + budget already checked). */
    force?: boolean;
  },
): Promise<StoryAffinityResult | null> {
  if (!primary.title?.trim() || !candidate.title?.trim()) {
    return null;
  }

  if (!options?.force && !isJevFeatureEnabled("cluster")) {
    return null;
  }
  const budget = checkJevBudget(tenantId);
  if (!budget.allowed) {
    await recordJevUsage({
      tenantId,
      feature: "cluster",
      latencyMs: 0,
      fallbackReason: budget.reason ?? "budget exceeded",
    });
    return null;
  }

  const client = options?.client ?? (await getTypesafeClient(tenantId));
  if (!client) {
    return null;
  }

  try {
    const startedAt = Date.now();
    const response = await client.systemOne({
      state: {
        primaryStory: {
          title: primary.title.trim().slice(0, 300),
          excerpt: primary.body ? primary.body.trim().slice(0, 600) : null,
        },
        candidateStory: {
          title: candidate.title.trim().slice(0, 300),
          excerpt: candidate.body ? candidate.body.trim().slice(0, 600) : null,
        },
        ...(options?.pageContext
          ? {
              page: {
                name: options.pageContext.name || null,
                niche: options.pageContext.niche || null,
                audience: options.pageContext.audience || null,
              },
            }
          : {}),
      },
      questions: {
        relationship: choice(
          "What is the editorial relationship between the primary story and the candidate story?",
          {
            same_event: "Both articles report on the exact same underlying news event, breaking incident, announcement, match, or release.",
            related_topic: "Both articles share the same entity, league, domain, or subject, but report on different specific events, games, or incidents.",
            unrelated: "The articles are about completely distinct topics, entities, or domains.",
          },
        ),
        corroboration: choice(
          "How do the factual claims in the candidate story compare with the primary story?",
          {
            corroborates: "The candidate article confirms, supports, or aligns with the core factual claims of the primary story.",
            neutral_or_additive: "The candidate article adds new angles, commentary, or context without disputing the primary claims.",
            contradicts: "The candidate article directly disputes, refutes, or contradicts key factual claims made in the primary story.",
          },
        ),
      },
    });

    const relAnswer = response.answers.relationship;
    const corAnswer = response.answers.corroboration;
    const latencyMs = Date.now() - startedAt;

    if (!relAnswer || !corAnswer) {
      await recordJevUsage({
        tenantId,
        feature: "cluster",
        latencyMs,
        fallbackReason: "no-answer",
        modelId: (response as { model?: string }).model ?? "jev",
      });
      return null;
    }

    const relationship = (relAnswer.choice in { same_event: 1, related_topic: 1, unrelated: 1 }
      ? relAnswer.choice
      : "unrelated") as StoryRelationship;

    const corroboration = (corAnswer.choice in { corroborates: 1, neutral_or_additive: 1, contradicts: 1 }
      ? corAnswer.choice
      : "neutral_or_additive") as StoryCorroboration;

    const relationshipProbability = relAnswer.probabilities[relationship] ?? 0;
    const corroborationProbability = corAnswer.probabilities[corroboration] ?? 0;
    await recordJevUsage({
      tenantId,
      feature: "cluster",
      latencyMs,
      confidence: relAnswer.confidence ?? 0,
      probability: relationshipProbability,
      modelId: (response as { model?: string }).model ?? "jev",
    });
    return {
      relationship,
      relationshipConfidence: relAnswer.confidence ?? 0,
      relationshipProbability,
      corroboration,
      corroborationConfidence: corAnswer.confidence ?? 0,
      corroborationProbability,
    };
  } catch (error) {
    console.warn("[typesafe] Story affinity evaluation failed gracefully:", error);
    await recordJevUsage({
      tenantId,
      feature: "cluster",
      latencyMs: 0,
      fallbackReason: error instanceof Error ? error.message.slice(0, 200) : "provider-error",
    });
    return null;
  }
}

export interface ScoutItemInput {
  id?: string;
  url: string;
  text: string;
  views?: number;
  likes?: number;
  timestamp?: string;
}

export interface ScoutTriggerResult {
  triggered: boolean;
  confidence: number;
  probability: number;
}

/**
 * Evaluates whether scraped posts meet a user's Scout Goal condition using TypeSafe Jev.
 * Acts as a fast (~150ms), low-cost pre-gate to skip calling generative LLMs on routine "no change" runs.
 */
export async function evaluateScoutTriggerSemantically(
  goalCondition: string,
  targetUrl: string,
  platform: string,
  items: ScoutItemInput[],
  tenantId?: string | null,
  options?: {
    client?: TypeSafeClient;
    confidenceThreshold?: number;
    probabilityThreshold?: number;
  },
): Promise<ScoutTriggerResult | null> {
  if (!goalCondition?.trim() || !items || items.length === 0) {
    return null;
  }

  if (!isJevFeatureEnabled("scout")) {
    return null;
  }
  const budget = checkJevBudget(tenantId);
  if (!budget.allowed) {
    await recordJevUsage({
      tenantId,
      feature: "scout",
      latencyMs: 0,
      fallbackReason: budget.reason ?? "budget exceeded",
    });
    return null;
  }

  const client = options?.client ?? (await getTypesafeClient(tenantId));
  if (!client) {
    return null;
  }

  try {
    const startedAt = Date.now();
    const response = await client.systemOne({
      state: {
        goal: goalCondition.trim(),
        targetAccount: {
          url: targetUrl,
          platform,
        },
        posts: items.slice(0, 15).map((item, idx) => ({
          index: idx,
          caption: item.text ? item.text.slice(0, 300) : "",
          views: item.views ?? 0,
          likes: item.likes ?? 0,
          timestamp: item.timestamp ?? null,
        })),
      },
      questions: {
        is_triggered: choice(
          `Based on the user's goal condition ("${goalCondition.trim()}"), does any of the recent posts satisfy or trigger this goal?`,
          {
            triggered:
              "At least one post clearly satisfies the goal condition (e.g. viral view spike, major price cut, new product/service announcement, breaking milestone).",
            not_triggered:
              "None of the posts satisfy the goal condition. These are ordinary, routine, baseline posts that do not meet the user's specific trigger criteria.",
          },
        ),
      },
    });

    const answer = response.answers.is_triggered;
    const latencyMs = Date.now() - startedAt;
    if (!answer) {
      await recordJevUsage({
        tenantId,
        feature: "scout",
        latencyMs,
        fallbackReason: "no-answer",
        modelId: (response as { model?: string }).model ?? "jev",
      });
      return null;
    }

    const isTriggered = answer.choice === "triggered";
    const confidence = answer.confidence ?? 0;
    const probability = answer.probabilities[answer.choice] ?? 0;

    await recordJevUsage({
      tenantId,
      feature: "scout",
      latencyMs,
      confidence,
      probability,
      triggered: isTriggered,
      modelId: (response as { model?: string }).model ?? "jev",
    });
    return {
      triggered: isTriggered,
      confidence,
      probability,
    };
  } catch (error) {
    console.warn("[typesafe] Scout trigger evaluation failed gracefully:", error);
    await recordJevUsage({
      tenantId,
      feature: "scout",
      latencyMs: 0,
      fallbackReason: error instanceof Error ? error.message.slice(0, 200) : "provider-error",
    });
    return null;
  }
}


