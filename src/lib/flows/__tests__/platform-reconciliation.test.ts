import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupRetryDelayMs, runOwnsCleanupReservation } from "@/lib/storage-cleanup";
import { terminalTimestamp } from "@/lib/flows/run-flow-server";
import {
  hashWebhookSecret,
  isHashedWebhookSecret,
  verifyWebhookSecret,
} from "@/lib/flows/webhook-secret";

describe("flow platform reconciliation", () => {
  it("keeps approval pauses non-terminal while completed runs receive a timestamp", () => {
    const now = new Date("2026-08-30T00:00:00.000Z");
    expect(terminalTimestamp("waiting_approval", now)).toBeNull();
    expect(terminalTimestamp("succeeded", now)).toEqual(now);
    expect(terminalTimestamp("failed", now)).toEqual(now);
  });

  it("protects cleanup reservations until their owning run is terminal", () => {
    expect(runOwnsCleanupReservation("running")).toBe(true);
    expect(runOwnsCleanupReservation("waiting_approval")).toBe(true);
    expect(runOwnsCleanupReservation("succeeded")).toBe(false);
    expect(runOwnsCleanupReservation("failed")).toBe(false);
    expect(runOwnsCleanupReservation(null)).toBe(false);
  });

  it("bounds cleanup retry backoff", () => {
    expect(cleanupRetryDelayMs(1)).toBe(2_000);
    expect(cleanupRetryDelayMs(8)).toBe(256_000);
    expect(cleanupRetryDelayMs(30)).toBe(3_600_000);
  });

  it("hashes webhook secrets and compares hashed or legacy values safely", () => {
    const stored = hashWebhookSecret("wf_secret");
    expect(isHashedWebhookSecret(stored)).toBe(true);
    expect(stored).not.toContain("wf_secret");
    expect(verifyWebhookSecret("wf_secret", stored)).toBe(true);
    expect(verifyWebhookSecret("wf_other", stored)).toBe(false);
    expect(verifyWebhookSecret("legacy", "legacy")).toBe(true);
    expect(verifyWebhookSecret("wrong", "legacy")).toBe(false);
    expect(verifyWebhookSecret(null, stored)).toBe(false);
  });

  it("does not mutate published migration files and only appends new migrations", () => {
    const migrations = resolve(process.cwd(), "src/lib/db/migrations");
    const published = {
      "0021_rate_limit_counters.sql": "cf0c90036deebe350c423e9c2c9936945f18aba1b6724b51d0ba7cce3bb59b94",
      "0022_flow_platform.sql": "bdeb82ff15206ccf49f0eaa6750eff779c1a964851878ca7de65230bc606650c",
      "0023_r2_cleanup_tasks.sql": "788eac207d7f27029119d9c6328dd520aff158c5907b77606d6a612d9236a71a",
      "0024_flow_platform_reconciliation.sql": "9975b009541cf1e840b411ab3c4bef55eaf3298c0deaa7230d60b7e0d27c0720",
    };

    for (const [file, expected] of Object.entries(published)) {
      const contents = readFileSync(resolve(migrations, file));
      expect(createHash("sha256").update(contents).digest("hex"), file).toBe(expected);
    }

    const journal = JSON.parse(
      readFileSync(resolve(migrations, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ idx: number; tag: string }> };
    expect(journal.entries.find(({ idx }) => idx === 25)).toEqual(expect.objectContaining({ tag: "0025_flow_incoming_webhooks" }));
    expect(journal.entries.at(-1)).toEqual(expect.objectContaining({ idx: 26, tag: "0026_telegram_bot_installations" }));
  });
});
