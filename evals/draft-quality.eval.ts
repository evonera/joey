import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
    test: async (t) => {
        await t.send("Generate a post about our new SaaS feature: AI code completion.");
        t.succeeded();
        t.check(t.reply, includes("SaaS"));
        t.check(t.reply, includes("code completion"));
    }
});
