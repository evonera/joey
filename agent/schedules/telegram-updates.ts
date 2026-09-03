import { defineSchedule } from "eve/schedules";
import { processTelegramApprovalUpdates } from "@/lib/telegram-approvals";
export default defineSchedule({ cron: "0 3 * * *", async run() { await processTelegramApprovalUpdates(); } });
