import { describe, expect, it } from "vitest";
import { FLOWS_TICK_BATCH_LIMIT, FLOWS_TICK_CONCURRENCY, runWithConcurrencyLimit } from "#schedules/flows-tick";

describe("flows-tick bounded fan-out", () => {
  it("caps concurrency and processes every item", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const seen: number[] = [];
    await runWithConcurrencyLimit(
      [1, 2, 3, 4, 5, 6, 7, 8],
      2,
      async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        seen.push(item);
        inFlight -= 1;
      },
    );
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it("isolates item failures without stopping the pool", async () => {
    const seen: number[] = [];
    await runWithConcurrencyLimit([1, 2, 3], 2, async (item) => {
      if (item === 2) throw new Error("boom");
      seen.push(item);
    });
    expect(seen.sort()).toEqual([1, 3]);
  });

  it("keeps sane batch defaults", () => {
    expect(FLOWS_TICK_BATCH_LIMIT).toBeLessThanOrEqual(50);
    expect(FLOWS_TICK_CONCURRENCY).toBeLessThanOrEqual(5);
  });
});
