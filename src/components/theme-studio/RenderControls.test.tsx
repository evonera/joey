import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ setup: vi.fn(), render: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/theme-packages", () => ({ getThemeRenderSetup: mocks.setup, renderThemePackage: mocks.render, selectThemeSourceMedia: vi.fn() }));
vi.mock("@/app/actions/media", () => ({ getMediaRender: vi.fn().mockResolvedValue({ status: "succeeded", canRetry: false }), retryMediaRender: vi.fn(), cancelMediaRender: vi.fn() }));
import { RenderControls } from "./RenderControls";
const assetId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
describe("saved package render controls", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);
  it("clears a successful native render status when copy edits invalidate its export", async () => {
    const view = render(<RenderControls packageId="package" hasFinishedMedia />);
    expect(await screen.findByRole("status")).toHaveTextContent("succeeded");
    view.rerender(<RenderControls packageId="package" hasFinishedMedia={false} />);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
  it("restores the selected media, crop, trim, zoom and audio before resubmission", async () => {
    mocks.setup.mockResolvedValue({ enabled: true, video: true, candidates: [], assets: [{ id: "unrelated", filename: "Unrelated clip", publicUrl: "https://example.com/unrelated.mp4" }, { id: assetId, filename: "Saved clip", publicUrl: "https://example.com/saved.mp4" }], images: [], music: [], settings: { mediaAssetId: assetId, templateFamily: "minimal_meme", cropMode: "cover", cropX: .2, cropY: .8, trimStart: 3, durationSeconds: 7, zoom: 1.08, sourceAudio: false, captions: true } });
    mocks.render.mockResolvedValue({ jobId: "job", status: "queued" });
    render(<RenderControls packageId="package" />);
    fireEvent.click(screen.getByRole("button", { name: "Render media" }));
    expect(await screen.findByLabelText("Source asset")).toHaveValue(assetId);
    expect(screen.getByLabelText("Clip starts at (seconds)")).toHaveValue(3);
    expect(screen.getByLabelText("Duration (seconds)")).toHaveValue(7);
    expect(screen.getByLabelText("Keep source audio")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Create export" }));
    await waitFor(() => expect(mocks.render).toHaveBeenCalledWith("package", expect.objectContaining({ mediaAssetId: assetId, trimStart: 3, durationSeconds: 7, cropMode: "cover", cropX: .2, cropY: .8, zoom: 1.08, sourceAudio: false, captions: true, templateFamily: "minimal_meme" })));
  });
  it("requires an explicit media choice when nothing has been saved", async () => {
    mocks.setup.mockResolvedValue({ enabled: true, video: true, candidates: [], settings: {}, assets: [{ id: assetId, filename: "Unrelated image" }], images: [], music: [] });
    render(<RenderControls packageId="package" />);
    fireEvent.click(screen.getByRole("button", { name: "Render media" }));
    expect(await screen.findByLabelText("Source asset")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Create export" })).toBeDisabled();
  });
});
