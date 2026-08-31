import { defineSchedule } from "eve/schedules";
import { processTelegramOutbox } from "@/lib/telegram-outbox";

export default defineSchedule({ cron: "* * * * *", async run() { await processTelegramOutbox(); } });
