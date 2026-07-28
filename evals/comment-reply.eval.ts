import { defineEval } from "eve/evals";

export default defineEval({
    test: async (t: any) => {
        // Simulate a harsh comment webhook ingestion
        const response = await t.send("Draft a reply to the following comment: 'Your platform is too expensive and slow.'");
        
        const responseStr = (typeof response === "string" ? response : JSON.stringify(response)).toLowerCase();
        
        // Assert the reply is polite and de-escalating (e.g. contains apology or offer to help)
        if (responseStr.includes("sorry") || responseStr.includes("help") || responseStr.includes("understand")) {
            t.succeeded();
        } else {
            t.failed("Comment reply regression: Agent did not generate a polite or contextually appropriate de-escalating reply.");
        }
    }
});
