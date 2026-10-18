import type { ScoutPostItem } from "./data-provider";

export interface MeasuredGoalResult {
  triggered: boolean;
  title: string;
  topPostIndex: number;
  changes: Array<{ type: "ADDED" | "SPIKE"; label: string; before?: string; after: string; rationale: string }>;
}

/** Only explicit numeric syntax is deterministic; other goals use qualitative evaluation. */
export function evaluateMeasuredGoal(
  goal: string,
  items: ScoutPostItem[],
  baseline: ScoutPostItem[] = []
): MeasuredGoalResult | null {
  const match = goal
    .trim()
    .match(/^(views|likes)\s*(growth)?\s*(>=|>|above|at least)\s*(\d+(?:\.\d+)?)\s*([km%]?)\s*$/i);
  if (!match) return null;
  const metric = match[1].toLowerCase() as "views" | "likes";
  const growth = Boolean(match[2]);
  const suffix = match[5].toLowerCase();
  if (growth !== (suffix === "%")) return null;
  const threshold = Number(match[4]) * (suffix === "k" ? 1000 : suffix === "m" ? 1e6 : 1);
  const inclusive = [">=", "at least"].includes(match[3].toLowerCase());
  const result: MeasuredGoalResult = { triggered: false, title: `${metric} goal met`, topPostIndex: 0, changes: [] };
  for (const [index, item] of items.entries()) {
    const value = item[metric];
    if (typeof value !== "number") continue;
    const previous = baseline.find(
      (post) => post.id === item.id && post.url === item.url && post[metric] !== undefined
    );
    let measured = value;
    if (growth) {
      if (
        !previous ||
        !previous.observedAt ||
        !item.observedAt ||
        !(Date.parse(previous.observedAt) < Date.parse(item.observedAt)) ||
        !(previous[metric]! > 0)
      )
        continue;
      measured = ((value - previous[metric]!) / previous[metric]!) * 100;
    }
    if (!(inclusive ? measured >= threshold : measured > threshold)) continue;
    return {
      ...result,
      triggered: true,
      topPostIndex: index,
      changes: [
        {
          type: growth ? "SPIKE" : "ADDED",
          label: growth ? `${metric} growth` : `${metric} threshold`,
          ...(growth ? { before: `${previous![metric]} ${metric} observed at ${previous!.observedAt}` } : {}),
          after: `${value} ${metric}${growth ? ` (${measured.toFixed(2)}% growth)` : ""}`,
          rationale: growth
            ? `Measured between saved observations at ${previous!.observedAt} and ${item.observedAt}.`
            : `Observed count meets the explicit goal ${goal}.`,
        },
      ],
    };
  }
  return result;
}

/** Never accept a model's SPIKE claim without a matching, dated counter increase. */
export function measuredPostIncreases(post: ScoutPostItem, baseline: ScoutPostItem[]): MeasuredGoalResult["changes"] {
  const previous = baseline.find((item) => item.id === post.id && item.url === post.url);
  if (!previous?.observedAt || !post.observedAt || !(Date.parse(previous.observedAt) < Date.parse(post.observedAt)))
    return [];
  return (["views", "likes"] as const).flatMap((metric) => {
    const before = previous[metric],
      after = post[metric];
    if (typeof before !== "number" || typeof after !== "number" || !(after > before)) return [];
    return [
      {
        type: "SPIKE" as const,
        label: `${metric} increase`,
        before: `${before} ${metric} observed at ${previous.observedAt}`,
        after: `${after} ${metric} observed at ${post.observedAt}`,
        rationale: `Saved observations show an increase of ${after - before} ${metric}.`,
      },
    ];
  });
}
