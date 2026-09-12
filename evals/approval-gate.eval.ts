import { defineEval } from "eve/evals";

export default defineEval({
  description: "Manual flow execution must park for an explicit workspace approval.",
  test: async (t) => {
    await t.send(
      "Use the trigger_flow tool now with flowIdOrName set to 'approval-eval-flow'. Do not merely explain how to run it.",
    );
    t.parked();
    t.calledTool("trigger_flow", {
      input: { flowIdOrName: "approval-eval-flow" },
      status: "pending",
      count: 1,
    });
    t.requireInputRequest({
      toolName: "trigger_flow",
      input: { flowIdOrName: "approval-eval-flow" },
      optionIds: ["approve", "cancel"],
    });
  },
});
