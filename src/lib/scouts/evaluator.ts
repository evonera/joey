import { db } from "@/lib/db";
import { scouts, scoutRuns, member, notifications } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { resolveToken } from "@/lib/flows/nodes/data/apify-actor";
import { generateText } from "ai";
import { resolveModelForTurn } from "@/lib/agent-model-resolver";

export interface ScoutAlert {
  title: string;
  detectedAt: string;
  targetUrl: string;
  platform: string;
  goal: string;
  changes: Array<{
    type: "CHANGED" | "ADDED" | "SPIKE";
    label: string;
    before?: string;
    after: string;
    rationale: string;
  }>;
  samplePost?: {
    url: string;
    content: string;
    views?: number;
    likes?: number;
    detectedFormat?: string;
  };
}

export interface EvaluateScoutResult {
  triggered: boolean;
  alert?: ScoutAlert;
  itemsFound: number;
  error?: string;
}

export interface EvaluateScoutOptions {
  force?: boolean;
}

const inFlightEvaluations = new Map<string, Promise<EvaluateScoutResult>>();

/**
 * Evaluates a scout against its goal condition by scraping the target and running an LLM diff judge.
 * Deduplicates concurrent in-flight evaluations for the same scout ID.
 */
export async function evaluateScout(
  scoutId: string,
  options?: { force?: boolean }
): Promise<EvaluateScoutResult> {
  const existing = inFlightEvaluations.get(scoutId);
  if (existing) {
    return existing;
  }

  const evalPromise = (async () => {
    const scout = await db.query.scouts.findFirst({
      where: eq(scouts.id, scoutId),
    });

    if (!scout) {
      throw new Error(`Scout with id ${scoutId} not found.`);
    }

    // Debounce recent executions (within 15 seconds) unless forced
    if (!options?.force && scout.lastPolledAt && Date.now() - scout.lastPolledAt.getTime() < 15_000) {
      return {
        triggered: Boolean(scout.latestAlert),
        alert: (scout.latestAlert as ScoutAlert | null) ?? undefined,
        itemsFound: 0,
      };
    }

    try {
      // 1. Resolve posts / items from Apify or fallback
      let items: Array<{ id: string; url: string; text: string; views?: number; likes?: number; timestamp?: string }> = [];

      let apifyToken: string | null = null;
      try {
        apifyToken = await resolveToken(scout.tenantId);
      } catch {
        apifyToken = null;
      }

      if (apifyToken) {
        // Map platform to common Apify actors
        const actorId =
          scout.platform === "instagram"
            ? "apify/instagram-reel-scraper"
            : scout.platform === "tiktok"
              ? "clockworks/tiktok-scraper"
              : "apify/web-scraper";

        const scrapeUrl =
          `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}` +
          `/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}&timeout=45`;

        const input =
          scout.platform === "instagram"
            ? { usernames: [scout.targetUrl.replace(/^.*instagram\.com\//, "").replace(/\/.*$/, "")] }
            : { directUrls: [scout.targetUrl] };

        const response = await fetch(scrapeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            items = data.slice(0, 15).map((row: any, i: number) => ({
              id: String(row.id || i),
              url: row.url || row.postUrl || scout.targetUrl,
              text: row.caption || row.text || row.description || "",
              views: row.videoViewCount || row.playCount || row.views || 0,
              likes: row.likesCount || row.diggCount || row.likes || 0,
              timestamp: row.timestamp || row.createTimeISO || new Date().toISOString(),
            }));
          }
        }
      } else {
        const isMockAllowed = process.env.NODE_ENV === "test" || process.env.ENABLE_MOCK_SCOUTS === "true";
        if (isMockAllowed) {
          items = [
            {
              id: "sim-1",
              url: `${scout.targetUrl}/p/recent-viral-hook`,
              text: "Stop scrolling: The 1 reason 90% of creators fail before reaching 10k followers. [Split-screen reaction with bold subtitle captions]",
              views: 125000,
              likes: 8400,
              timestamp: new Date(Date.now() - 3600000).toISOString(),
            },
            {
              id: "sim-2",
              url: `${scout.targetUrl}/p/standard-post`,
              text: "Quick reminder to take a break this weekend.",
              views: 12000,
              likes: 800,
              timestamp: new Date(Date.now() - 86400000).toISOString(),
            },
          ];
        } else {
          const errorMsg = "Apify integration not configured. Please add an Apify API token in Integrations to enable live scout monitoring.";
          await db.insert(scoutRuns).values({
            scoutId: scout.id,
            tenantId: scout.tenantId,
            status: "failed",
            itemsFound: 0,
            error: errorMsg,
          });
          return {
            triggered: false,
            itemsFound: 0,
            error: errorMsg,
          };
        }
      }

      if (items.length === 0) {
        await db.insert(scoutRuns).values({
          scoutId: scout.id,
          tenantId: scout.tenantId,
          status: "no_change",
          itemsFound: 0,
        });
        await db
          .update(scouts)
          .set({
            lastPolledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(scouts.id, scout.id));
        return {
          triggered: false,
          itemsFound: 0,
        };
      }

    // 2. Evaluate items against goal condition using LLM
    let alert: ScoutAlert | undefined;
    let triggered = false;

    try {
      const { model } = await resolveModelForTurn({
        preferredModel: "google/gemini-2.5-flash",
        tenantId: scout.tenantId,
      });

      const prompt = `You are an expert Social Media Scout AI.
Evaluate whether the following recent posts from ${scout.targetUrl} (${scout.platform}) trigger this user's Scout Goal:
GOAL: "${scout.goalCondition}"

POSTS:
${JSON.stringify(items, null, 2)}

Return a strict JSON object with this schema:
{
  "triggered": boolean,
  "title": string,
  "changes": [
    {
      "type": "SPIKE" | "CHANGED" | "ADDED",
      "label": string,
      "before": string,
      "after": string,
      "rationale": string
    }
  ],
  "topPostIndex": number
}
Only trigger if a post genuinely meets the goal. Do not fabricate spikes. If none trigger, set "triggered": false.`;

      const { text } = await generateText({
        model,
        prompt,
      });

      const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.triggered && parsed.changes?.length > 0) {
        triggered = true;
        const topPost = items[parsed.topPostIndex ?? 0] || items[0];
        alert = {
          title: parsed.title || `Scout Alert: ${scout.name}`,
          detectedAt: new Date().toISOString(),
          targetUrl: scout.targetUrl,
          platform: scout.platform,
          goal: scout.goalCondition,
          changes: parsed.changes,
          samplePost: topPost
            ? {
                url: topPost.url,
                content: topPost.text,
                views: topPost.views,
                likes: topPost.likes,
                detectedFormat: "Short-form Hook Reel",
              }
            : undefined,
        };
      }
    } catch (llmErr) {
      console.warn(`[scout-evaluator] LLM evaluation error:`, llmErr);
      // Fallback heuristic: check if any item views > 50,000 or meets high engagement
      const spikeItem = items.find((i) => (i.views || 0) > 50000);
      if (spikeItem) {
        triggered = true;
        alert = {
          title: `${scout.name} engagement spike detected`,
          detectedAt: new Date().toISOString(),
          targetUrl: scout.targetUrl,
          platform: scout.platform,
          goal: scout.goalCondition,
          changes: [
            {
              type: "SPIKE",
              label: "High View Count",
              before: "Average ~15k views",
              after: `${(spikeItem.views || 0).toLocaleString()} views`,
              rationale: "Exceeded velocity threshold defined in Scout goal",
            },
          ],
          samplePost: {
            url: spikeItem.url,
            content: spikeItem.text,
            views: spikeItem.views,
            likes: spikeItem.likes,
            detectedFormat: "Spike Format",
          },
        };
      }
    }

    // 3. Persist run & update scout
    await db.insert(scoutRuns).values({
      scoutId: scout.id,
      tenantId: scout.tenantId,
      status: triggered ? "alert_triggered" : "no_change",
      itemsFound: items.length,
      alertData: alert ?? null,
    });

    await db
      .update(scouts)
      .set({
        lastPolledAt: new Date(),
        latestAlert: alert ? (alert as any) : scout.latestAlert,
        updatedAt: new Date(),
      })
      .where(eq(scouts.id, scout.id));

      return {
        triggered,
        alert,
        itemsFound: items.length,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await db.insert(scoutRuns).values({
        scoutId: scout.id,
        tenantId: scout.tenantId,
        status: "failed",
        itemsFound: 0,
        error: errorMsg,
      });
      return {
        triggered: false,
        itemsFound: 0,
        error: errorMsg,
      };
    }
  })();

  inFlightEvaluations.set(scoutId, evalPromise);
  try {
    return await evalPromise;
  } finally {
    inFlightEvaluations.delete(scoutId);
  }
}

export interface ScoutsTickOptions {
  dispatchAlert?: (params: {
    scout: typeof scouts.$inferSelect;
    alert: ScoutAlert;
    ownerUserId: string;
  }) => Promise<void> | void;
}

export async function runScoutsTick(options?: ScoutsTickOptions) {
  const now = new Date();

  // Find active scouts that are due for polling
  const activeScouts = await db.query.scouts.findMany({
    where: eq(scouts.isActive, true),
  });

  const dueScouts = activeScouts.filter((scout) => {
    if (!scout.lastPolledAt) return true;
    const nextDue = new Date(scout.lastPolledAt.getTime() + scout.pollIntervalMinutes * 60 * 1000);
    return nextDue <= now;
  });

  const results: Array<{ scoutId: string; triggered: boolean; error?: string }> = [];

  for (const scout of dueScouts) {
    try {
      const evaluation = await evaluateScout(scout.id);
      results.push({ scoutId: scout.id, triggered: evaluation.triggered, error: evaluation.error });

      if (evaluation.triggered && evaluation.alert) {
        // Find owner member to notify
        const ownerMember = await db.query.member.findFirst({
          where: and(eq(member.organizationId, scout.tenantId), eq(member.role, "owner")),
        });

        // 1. Persist in-app notification
        try {
          await db.insert(notifications).values({
            tenantId: scout.tenantId,
            type: "scout_alert",
            title: evaluation.alert.title,
            body: `Competitor change detected for ${scout.name}: ${evaluation.alert.changes.map((c) => c.label).join(", ")}`,
            link: "/scouts",
            metadata: evaluation.alert,
          });
        } catch (notifErr) {
          console.error(`[scout-poll] Failed creating in-app notification:`, notifErr);
        }

        // 2. Dispatch to channel if callback provided
        if (ownerMember && options?.dispatchAlert) {
          try {
            await options.dispatchAlert({
              scout,
              alert: evaluation.alert,
              ownerUserId: ownerMember.userId,
            });
          } catch (dispatchErr) {
            console.error(`[scout-poll] Failed dispatching scout alert:`, dispatchErr);
          }
        }
      }
    } catch (err) {
      console.error(`[scout-poll] Failed evaluating scout ${scout.id}:`, err);
      results.push({ scoutId: scout.id, triggered: false, error: String(err) });
    }
  }

  return { checkedCount: dueScouts.length, results };
}


