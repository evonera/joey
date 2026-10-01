import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), reserve: vi.fn(), estimate: vi.fn() }));
vi.mock("eve", () => ({ defineAgent: (value: unknown) => value, defineDynamic: (value: unknown) => value }));
vi.mock("@/lib/agent-model-resolver", () => ({ resolveModelForTurn: mocks.resolve }));
vi.mock("@/lib/ai-pricing", () => ({ estimateTextCallCost: mocks.estimate }));
vi.mock("@/lib/usage", () => ({ eveUsageReservationId: () => "reservation", reserveUsageBudget: mocks.reserve }));
vi.mock("../agency-session", () => ({ agencyProfileForSession: vi.fn() }));
import root from "../../agent";
import linkedin from "../../subagents/linkedin/agent";
import twitter from "../../subagents/twitter/agent";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ model: "fake-google-model", providerModelId: "gemini-3.8-flash", modelContextWindowTokens: 1_048_576 });
  mocks.estimate.mockReturnValue(0.01);
});
describe("Eve fallback model reservations", () => {
  it.each([["root", root], ["linkedin", linkedin], ["twitter", twitter]])("%s accounts for the selected fallback, not the requested model", async (_name, definition) => {
    const dynamic = definition.model as unknown as { events: { "step.started": (event: unknown, ctx: unknown) => Promise<unknown> } };
    const messages = [{ role: "user", content: "Draft safely" }];
    const selection = await dynamic.events["step.started"](
      { data: { turnId: "turn", stepIndex: 0, sequence: 0 } },
      { messages, session: { id: "session", auth: { current: { attributes: { tenantId: "tenant", preferredModel: "openai/gpt-5.6-luna" } } } } },
    );
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ modelId: "gemini-3.8-flash", estimatedCostUsd: 0.01 }));
    expect(mocks.estimate).toHaveBeenCalledWith("gemini-3.8-flash", messages, expect.any(Number));
    // Return only public Eve selection fields; accounting metadata is not runtime config.
    expect(selection).toEqual({ model: "fake-google-model", modelContextWindowTokens: 1_048_576 });
  });
});
