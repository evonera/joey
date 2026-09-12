import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

export default defineEval({
    test: async (t) => {
        // Provide temporal updates to simulate a memory update scenario
        await t.send("Update profile: We no longer use emojis in our posts.");
        await t.send("Draft a social media post about our new AI feature.");
        t.succeeded();
        t.check(
          t.reply ?? "",
          satisfies(
            (reply) => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(String(reply)),
            "reply contains no emoji",
          ),
        );
    }
});
