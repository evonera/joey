import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiDecisionNode, parseDecisionChoices, wrapDecisionOutput } from "../nodes/ai/decision";
import { aiDecisionConfig } from "../catalog";
import { executeFlow } from "../executor";
import type { FlowGraphDoc } from "../types";

vi.mock("@/lib/typesafe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/typesafe")>();
  return {
    ...actual,
    getTypesafeClient: vi.fn(),
  };
});

import { getTypesafeClient } from "@/lib/typesafe";

describe("parseDecisionChoices", () => {
  it("parses valid choicesJson string", () => {
    const choices = parseDecisionChoices({
      choicesJson: JSON.stringify({
        billing: "Invoice questions",
        support: "Technical bug reports",
        sales: "New lead inquiries",
      }),
    });

    expect(choices).toEqual({
      billing: "Invoice questions",
      support: "Technical bug reports",
      sales: "New lead inquiries",
    });
  });

  it("parses choices record object", () => {
    const choices = parseDecisionChoices({
      choices: {
        lead: "Hot lead with purchase intent",
        spam: "Irrelevant promotional spam",
      },
    });

    expect(choices).toEqual({
      lead: "Hot lead with purchase intent",
      spam: "Irrelevant promotional spam",
    });
  });

  it("throws on invalid JSON syntax in choicesJson", () => {
    expect(() => parseDecisionChoices({ choicesJson: "{invalid-json" })).toThrow(
      "Invalid JSON syntax in choicesJson",
    );
  });

  it("throws when choices contains fewer than 2 valid criteria", () => {
    expect(() => parseDecisionChoices({ choices: { only_one: "Not enough choices" } })).toThrow(
      "at least 2 distinct choices are required",
    );
    expect(() =>
      parseDecisionChoices({ choicesJson: JSON.stringify({ only_one: "Not enough choices" }) }),
    ).toThrow("at least 2 distinct choices are required");
  });

  it("throws when normalized choice keys collide", () => {
    expect(() =>
      parseDecisionChoices({
        choices: {
          sales: "Sales inquiries",
          " sales ": "Duplicate sales after trimming",
        },
      }),
    ).toThrow('Duplicate decision choice branch "sales"');

    expect(() =>
      parseDecisionChoices({
        choicesJson: JSON.stringify({
          sales: "Sales inquiries",
          " sales ": "Duplicate sales after trimming",
        }),
      }),
    ).toThrow('Duplicate decision choice branch "sales"');
  });

  it("safely handles Object.prototype property names like constructor and toString", () => {
    const choices = parseDecisionChoices({
      choices: {
        constructor: "Object constructor queries",
        toString: "String representation inquiries",
      },
    });
    expect(choices).toEqual({
      constructor: "Object constructor queries",
      toString: "String representation inquiries",
    });

    const fromJson = parseDecisionChoices({
      choicesJson: JSON.stringify({
        constructor: "Object constructor queries",
        toString: "String representation inquiries",
      }),
    });
    expect(fromJson).toEqual({
      constructor: "Object constructor queries",
      toString: "String representation inquiries",
    });
  });

  it("defaults to binary yes/no only when neither choices nor choicesJson is configured", () => {
    expect(parseDecisionChoices({})).toEqual({
      yes: "The condition or criteria is met",
      no: "The condition or criteria is not met",
    });
  });
});

describe("aiDecisionConfig and getNodeOutputs", () => {
  it("rejects invalid choicesJson with schema error", () => {
    const res = aiDecisionConfig.safeParse({
      choicesJson: "{invalid-json",
    });
    expect(res.success).toBe(false);
  });

  it("rejects choicesJson with fewer than 2 choices", () => {
    const res = aiDecisionConfig.safeParse({
      choicesJson: JSON.stringify({ one: "Only one choice" }),
    });
    expect(res.success).toBe(false);
  });

  it("rejects choicesJson when keys collide after normalization", () => {
    const res = aiDecisionConfig.safeParse({
      choicesJson: JSON.stringify({ sales: "Sales inquiry", " sales ": "Colliding sales" }),
    });
    expect(res.success).toBe(false);
  });

  it("accepts valid choicesJson", () => {
    const res = aiDecisionConfig.safeParse({
      choicesJson: JSON.stringify({ sales: "Sales inquiry", support: "Technical bug" }),
    });
    expect(res.success).toBe(true);
  });
});

describe("wrapDecisionOutput", () => {
  it("preserves object properties and attaches __decision metadata", () => {
    const input = { id: "msg_123", text: "Need refund" };
    const wrapped = wrapDecisionOutput(
      input,
      "billing",
      0.95,
      { billing: 0.95, support: 0.05 },
      "billing",
    ) as Record<string, unknown>;

    expect(wrapped.id).toBe("msg_123");
    expect(wrapped.text).toBe("Need refund");
    expect(wrapped.choice).toBe("billing");
    expect(wrapped.confidence).toBe(0.95);
    expect(wrapped.__decision).toEqual({
      choice: "billing",
      rawChoice: "billing",
      confidence: 0.95,
      probabilities: { billing: 0.95, support: 0.05 },
    });
  });

  it("wraps primitives in data property", () => {
    const wrapped = wrapDecisionOutput("raw string input", "sales", 0.88, { sales: 0.88 }) as Record<string, unknown>;
    expect(wrapped.data).toBe("raw string input");
    expect(wrapped.choice).toBe("sales");
    expect(wrapped.confidence).toBe(0.88);
  });
});

describe("aiDecisionNode execution", () => {
  const mockContext = {
    tenantId: "tenant_123",
    flowId: "flow_123",
    runId: "run_123",
    nodeId: "dec_1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes Jev choice evaluation and routes to selected branch when confidence meets threshold", async () => {
    const mockSystemOne = vi.fn().mockResolvedValue({
      answers: {
        decision: {
          choice: "sales",
          confidence: 0.92,
          probabilities: { sales: 0.92, support: 0.08 },
        },
      },
    });

    vi.mocked(getTypesafeClient).mockResolvedValue({
      systemOne: mockSystemOne,
    } as any);

    const result = await aiDecisionNode.execute(
      { text: "How much does the pro plan cost?" },
      {
        question: "What is the intent of this inquiry?",
        choicesJson: JSON.stringify({
          sales: "Inquiry about pricing, upgrades, or purchasing",
          support: "Help with bugs or technical issues",
        }),
        confidenceThreshold: 0.7,
        defaultChoice: "fallback",
      },
      mockContext,
    );

    expect(mockSystemOne).toHaveBeenCalledWith(
      expect.objectContaining({
        state: { text: "How much does the pro plan cost?" },
        questions: expect.objectContaining({
          decision: expect.objectContaining({
            type: "choice",
            criteria: {
              sales: "Inquiry about pricing, upgrades, or purchasing",
              support: "Help with bugs or technical issues",
            },
          }),
        }),
      }),
      expect.objectContaining({ timeout: 3000 }),
    );

    expect(result.branch).toBe("sales");
    expect((result.output as any).choice).toBe("sales");
    expect((result.output as any).confidence).toBe(0.92);
  });

  it("routes to defaultChoice when Jev confidence is below threshold", async () => {
    const mockSystemOne = vi.fn().mockResolvedValue({
      answers: {
        decision: {
          choice: "support",
          confidence: 0.45,
          probabilities: { support: 0.45, sales: 0.35, casual: 0.2 },
        },
      },
    });

    vi.mocked(getTypesafeClient).mockResolvedValue({
      systemOne: mockSystemOne,
    } as any);

    const result = await aiDecisionNode.execute(
      { text: "maybe tomorrow or next week" },
      {
        question: "What is the intent?",
        choices: {
          support: "Support issue",
          sales: "Sales inquiry",
          casual: "Casual chit chat",
        },
        confidenceThreshold: 0.8,
        defaultChoice: "fallback",
      },
      mockContext,
    );

    expect(result.branch).toBe("fallback");
    expect((result.output as any).choice).toBe("fallback");
    expect((result.output as any).__decision.rawChoice).toBe("support");
    expect((result.output as any).confidence).toBe(0.45);
  });

  it("evaluates specified inputField when provided", async () => {
    const mockSystemOne = vi.fn().mockResolvedValue({
      answers: {
        decision: {
          choice: "yes",
          confidence: 0.98,
          probabilities: { yes: 0.98, no: 0.02 },
        },
      },
    });

    vi.mocked(getTypesafeClient).mockResolvedValue({
      systemOne: mockSystemOne,
    } as any);

    const result = await aiDecisionNode.execute(
      { payload: { comment: { body: "Is there an API available?" } } },
      {
        question: "Is this asking about technical capabilities?",
        inputField: "payload.comment.body",
      },
      mockContext,
    );

    expect(mockSystemOne).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "Is there an API available?",
      }),
      expect.any(Object),
    );
    expect(result.branch).toBe("yes");
  });

  it("throws descriptive error when API key is missing and fallbackOnError is false", async () => {
    vi.mocked(getTypesafeClient).mockResolvedValue(null);

    await expect(
      aiDecisionNode.execute(
        { text: "hello" },
        { question: "Is this a greeting?", fallbackOnError: false },
        mockContext,
      ),
    ).rejects.toThrow(/No TypeSafe API key configured/);
  });

  it("routes to defaultChoice when API key is missing and fallbackOnError is true", async () => {
    vi.mocked(getTypesafeClient).mockResolvedValue(null);

    const result = await aiDecisionNode.execute(
      { text: "hello" },
      { question: "Is this a greeting?", fallbackOnError: true, defaultChoice: "manual_review" },
      mockContext,
    );

    expect(result.branch).toBe("manual_review");
    expect((result.output as any).choice).toBe("manual_review");
  });

  it("routes to defaultChoice when client.systemOne fails and fallbackOnError is true", async () => {
    const mockSystemOne = vi.fn().mockRejectedValue(new Error("Network timeout"));
    vi.mocked(getTypesafeClient).mockResolvedValue({
      systemOne: mockSystemOne,
    } as any);

    const result = await aiDecisionNode.execute(
      { text: "test" },
      { question: "test question", fallbackOnError: true, defaultChoice: "safe_exit" },
      mockContext,
    );

    expect(result.branch).toBe("safe_exit");
    expect((result.output as any).choice).toBe("safe_exit");
  });
});

describe("End-to-End Flow Graph Integration with ai.decision", () => {
  it("routes canvas execution strictly down the selected branch handle and skips other branches", async () => {
    const mockSystemOne = vi.fn().mockResolvedValue({
      answers: {
        decision: {
          choice: "billing",
          confidence: 0.95,
          probabilities: { billing: 0.95, support: 0.05 },
        },
      },
    });

    vi.mocked(getTypesafeClient).mockResolvedValue({
      systemOne: mockSystemOne,
    } as any);

    const graph: FlowGraphDoc = {
      nodes: [
        {
          id: "trigger",
          type: "trigger.manual",
          config: { samplePayload: JSON.stringify({ issue: "Double charge on my credit card" }) },
          position: { x: 0, y: 0 },
        },
        {
          id: "decider",
          type: "ai.decision",
          config: {
            question: "Is this billing or support?",
            choicesJson: JSON.stringify({
              billing: "Invoice and credit card billing issues",
              support: "Bug reports and technical trouble",
            }),
            confidenceThreshold: 0.7,
            defaultChoice: "fallback",
          },
          position: { x: 200, y: 0 },
        },
        {
          id: "billing_handler",
          type: "transform.filter",
          config: { field: "issue", operator: "exists" },
          position: { x: 400, y: -100 },
        },
        {
          id: "support_handler",
          type: "transform.filter",
          config: { field: "issue", operator: "exists" },
          position: { x: 400, y: 100 },
        },
      ],
      edges: [
        { from: "trigger", to: "decider" },
        { from: "decider", to: "billing_handler", branch: "billing" },
        { from: "decider", to: "support_handler", branch: "support" },
      ],
    };

    const runResult = await executeFlow(graph, {
      tenantId: "test_tenant",
      flowId: "test_flow",
      runId: "test_run",
    });

    expect(runResult.status).toBe("succeeded");

    const billingStep = runResult.steps.find((s) => s.nodeId === "billing_handler");
    const supportStep = runResult.steps.find((s) => s.nodeId === "support_handler");
    const deciderStep = runResult.steps.find((s) => s.nodeId === "decider");

    expect(deciderStep?.status).toBe("succeeded");
    expect(billingStep?.status).toBe("succeeded");
    expect(supportStep?.status).toBe("skipped");

    expect(runResult.outputs["billing_handler"]).toBeDefined();
    expect(runResult.outputs["support_handler"]).toBeUndefined();
  });
});
