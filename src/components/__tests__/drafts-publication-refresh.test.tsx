import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ drafts: vi.fn(), counts: vi.fn() }));
vi.mock("@/app/actions/drafts", () => ({ getDrafts: mock.drafts, getDraftCounts: mock.counts, bulkApproveDrafts: vi.fn(), bulkRejectDrafts: vi.fn(), bulkDeleteDrafts: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("tab=all") }));
vi.mock("@/components/draft-card", () => ({ DraftCard: ({ draft }: { draft: { status: string } }) => <div>Post status: {draft.status}</div> }));
vi.mock("@/components/collaboration/liveblocks-provider", () => ({ useLiveblocksConfig: () => ({ isConfigured: false }) }));
vi.mock("@/components/collaboration/collaborative-avatars", () => ({ CollaborativeAvatars: () => null }));
vi.mock("@/app/actions/editorial-calendar", () => ({ canUseEditorialScheduling: async () => false }));
import DraftsPage from "@/app/(dashboard)/drafts/page";
const totals = (publishing: number) => ({ counts: { all: 1, draft: 0, pending_review: 0, scheduled: 0, approved: 0, publishing, published: 1 - publishing, failed: 0, rejected: 0 } });
const list = (status: string) => ({ drafts: [{ id: "async-post", status }] });
beforeEach(() => {
  vi.useFakeTimers();
  mock.drafts.mockReset().mockResolvedValue(list("publishing"));
  mock.counts.mockReset().mockResolvedValue(totals(1));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const settle = async () => { await act(async () => {}); };
const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(10_000); }); };
describe("automatic publication display", () => {
  it("shows a provider-confirmed completion without a reload and stops polling", async () => {
    render(<DraftsPage />);
    await settle();
    expect(screen.getByText("Post status: publishing")).toBeInTheDocument();
    mock.drafts.mockResolvedValue(list("published"));
    mock.counts.mockResolvedValue(totals(0));
    await tick();
    expect(screen.getByText("Post status: published")).toBeInTheDocument();
    const reads = mock.drafts.mock.calls.length;
    await tick();
    expect(mock.drafts).toHaveBeenCalledTimes(reads);
  });
  it("keeps a pending post visible through a read failure, then recovers", async () => {
    const view = render(<DraftsPage />);
    await settle();
    mock.drafts.mockRejectedValueOnce(new Error("temporary network failure"));
    await tick();
    expect(screen.getByText("Post status: publishing")).toBeInTheDocument();
    mock.drafts.mockResolvedValue(list("published"));
    mock.counts.mockResolvedValue(totals(0));
    await tick();
    expect(screen.getByText("Post status: published")).toBeInTheDocument();
    view.unmount();
    const reads = mock.drafts.mock.calls.length;
    await tick();
    expect(mock.drafts).toHaveBeenCalledTimes(reads);
  });
  it("keeps checking when counts finish before the list or a server action returns an error", async () => {
    render(<DraftsPage />);
    await settle();
    mock.counts.mockResolvedValue(totals(0));
    // The parallel queries can observe different database snapshots.
    await tick();
    expect(screen.getByText("Post status: publishing")).toBeInTheDocument();
    mock.drafts.mockResolvedValueOnce({ error: "Temporary list failure" });
    await tick();
    mock.drafts.mockResolvedValue(list("published"));
    await tick();
    expect(screen.getByText("Post status: published")).toBeInTheDocument();
  });
});
