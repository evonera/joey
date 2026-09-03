import { defineSchedule } from "eve/schedules";
import { processTelegramOutbox } from "@/lib/telegram-outbox";

export default defineSchedule({ cron: "0 2 * * *", async run() { await processTelegramOutbox(); } });
