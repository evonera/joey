import { describe, expect, it } from "vitest";
import { agentConfigSchema } from "../agent-config-validation";

const config = { brandVoice: "Clear and friendly", postingGoals: "Educate", postingSchedule: { timezone: "Asia/Kolkata", times: ["09:00"], activeDays: ["mon"], selectedAccountIds: [] } };
describe("saved agent schedule", () => {
  it("rejects impossible times, days, timezones and account identifiers", () => {
    for (const change of [{ times: ["24:00"] }, { times: ["09:60"] }, { activeDays: ["monday"] }, { timezone: "Mars/Olympus" }, { selectedAccountIds: ["foreign-value"] }]) {
      expect(agentConfigSchema.safeParse({ ...config, postingSchedule: { ...config.postingSchedule, ...change } }).success).toBe(false);
    }
  });
  it("deduplicates and orders valid slots without losing the timezone", () => {
    const result = agentConfigSchema.parse({ ...config, postingSchedule: { ...config.postingSchedule, times: ["15:00", "09:00", "09:00"] } });
    expect(result.postingSchedule.times).toEqual(["09:00", "15:00"]);
    expect(result.postingSchedule.timezone).toBe("Asia/Kolkata");
  });
});
