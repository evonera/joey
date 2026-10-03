import { defineSchedule } from "eve/schedules";
import { dispatchScoutsTick } from "@/lib/scouts/scheduler";
import { startScoutBatch } from "../lib/scout-workflow";

/**
 * Scout poll schedule.
 *
 * Cadence note: the Eve schedule cron MUST stay Hobby-safe (once per day or less —
 * Vercel rejects more frequent crons on Hobby at deploy time). Sub-day
 * `pollIntervalMinutes` (15m to 360m) are serviced by `/api/cron` which
 * runs runScoutsTick() on every invocation.
 */
export default defineSchedule({
  cron: "0 5 * * *",
  async run({ waitUntil }) {
    waitUntil(dispatchScoutsTick(startScoutBatch));
  },
});
