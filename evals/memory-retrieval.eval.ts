import { defineEval } from "eve/evals";

export default defineEval({
    test: async (t: any) => {
        // Provide temporal updates to simulate a memory update scenario
        await t.send("Update profile: We no longer use emojis in our posts.");
        const response = await t.send("Draft a social media post about our new AI feature.");
        
        const responseStr = JSON.stringify(response);
        // Assert that emojis are absent
        if (responseStr.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)) {
            throw new Error("Memory regression: Agent failed to adhere to the updated static profile regarding emojis.");
        } else {
            t.succeeded();
        }
    }
});
