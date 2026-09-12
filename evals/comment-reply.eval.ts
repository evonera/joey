import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
    test: async (t) => {
        // Simulate a harsh comment webhook ingestion
        await t.send("Draft a reply to the following comment: 'Your platform is too expensive and slow.'");
        t.succeeded();
        t.check(t.reply ?? "", includes(/sorry|help|understand/i));
    }
});
