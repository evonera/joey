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
 * Returns an authenticated TypeSafeClient instance with a default 2500ms timeout for webhooks.
 */
export async function getTypesafeClient(tenantId?: string | null): Promise<TypeSafeClient | null> {
  const apiKey = await resolveTypesafeApiKey(tenantId);
  if (!apiKey) return null;

  return new TypeSafeClient({
    apiKey,
    timeout: 2500,
  });
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

  const client = options?.client ?? (await getTypesafeClient(tenantId));
  if (!client) {
    return null;
  }

  const threshold = options?.confidenceThreshold ?? 0.85;

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
    if (!answer || answer.choice === "none") {
      return null;
    }

    if (answer.confidence < threshold) {
      return null;
    }

    const selectedProbability = answer.probabilities[answer.choice] ?? 0;
    if (selectedProbability < 0.75) {
      return null;
    }

    const matchedRuleId = answer.choice.replace(/^rule_/, "");
    return rules.find((r) => r.id === matchedRuleId) ?? null;
  } catch (error) {
    console.warn("[typesafe] Semantic DM match failed gracefully:", error);
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
  },
): Promise<StoryAffinityResult | null> {
  if (!primary.title?.trim() || !candidate.title?.trim()) {
    return null;
  }

  const client = options?.client ?? (await getTypesafeClient(tenantId));
  if (!client) {
    return null;
  }

  try {
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

    if (!relAnswer || !corAnswer) {
      return null;
    }

    const relationship = (relAnswer.choice in { same_event: 1, related_topic: 1, unrelated: 1 }
      ? relAnswer.choice
      : "unrelated") as StoryRelationship;

    const corroboration = (corAnswer.choice in { corroborates: 1, neutral_or_additive: 1, contradicts: 1 }
      ? corAnswer.choice
      : "neutral_or_additive") as StoryCorroboration;

    return {
      relationship,
      relationshipConfidence: relAnswer.confidence ?? 0,
      relationshipProbability: relAnswer.probabilities[relationship] ?? 0,
      corroboration,
      corroborationConfidence: corAnswer.confidence ?? 0,
      corroborationProbability: corAnswer.probabilities[corroboration] ?? 0,
    };
  } catch (error) {
    console.warn("[typesafe] Story affinity evaluation failed gracefully:", error);
    return null;
  }
}

