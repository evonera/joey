import { defineSchedule } from "eve/schedules";
import { processTelegramApprovalUpdates } from "@/lib/telegram-approvals";
export default defineSchedule({ cron: "* * * * *", async run() { await processTelegramApprovalUpdates(); } });
