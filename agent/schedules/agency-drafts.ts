/// <reference types="eve/workflow-modules" />
import { defineSchedule } from "eve/schedules";
import { start } from "workflow/api";
import { agencyDispatchWorkflow } from "../lib/agency-workflow";

export default defineSchedule({
  cron: "0 5 * * *",
  async run({ waitUntil }) {
    if (process.env.AGENCY_AUTOMATION_ENABLED !== "true") return;
    waitUntil(start(agencyDispatchWorkflow, [new Date().toISOString().slice(0, 10)]));
  },
});
