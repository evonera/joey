import { defineEval } from "eve/evals";

export default defineEval({
    test: async (t: any) => {
        const response = await t.send("Generate a post about our new SaaS feature: AI code completion.");
        if (typeof response === "string" && response.includes("SaaS") && response.includes("code completion")) {
            t.succeeded();
        } else {
            t.failed("Draft quality regression: Missing required terms 'SaaS' or 'code completion', or empty response.");
        }
    }
});
