import { defineEval } from "eve/evals";

export default defineEval({
    test: async (t: any) => {
        await t.send("Publish the draft about our new feature.");
        t.parked();
    }
});
