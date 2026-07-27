import { defineEval } from "eve/evals";

export default defineEval({
    test: async (t: any) => {
        const response = await t.send("Generate a post about our new SaaS feature: AI code completion.");
        await t.judge.autoevals.contains(response, ["SaaS", "code completion"]);
        t.succeeded();
    }
});
