import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { RenderControls } from "../RenderControls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions/media", () => ({ cancelMediaRender: vi.fn(), getMediaRender: vi.fn(), retryMediaRender: vi.fn() }));
vi.mock("@/app/actions/theme-packages", () => ({
  getThemeRenderSetup: vi.fn(async () => ({ enabled: true, video: true, music: [], images: [], assets: [
    { id: "a", filename: "a.mp4", publicUrl: "https://example.test/a.mp4" },
    { id: "b", filename: "b.mp4", publicUrl: "https://example.test/b.mp4" },
  ] })), renderThemePackage: vi.fn(),
}));
vi.mock("@/components/ui/dialog", () => {
  const Content = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? children : null,
    DialogContent: Content, DialogHeader: Content, DialogTitle: Content, DialogDescription: Content };
});

let metadataVideo: HTMLVideoElement;
beforeEach(() => {
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const element = create(tag, options);
    if (tag === "video") metadataVideo = element as HTMLVideoElement;
    return element;
  });
});
afterEach(() => vi.restoreAllMocks());
async function openWithDuration(duration: number) {
  render(<RenderControls packageId="package" />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Render media" })));
  Object.defineProperty(metadataVideo, "duration", { value: duration, configurable: true });
  act(() => metadataVideo.dispatchEvent(new Event("loadedmetadata")));
}
describe("render range controls", () => {
  it("preserves fractional metadata and clamps duration after a nonzero start", async () => {
    await openWithDuration(3.6);
    expect(screen.getByLabelText(/Duration \(seconds\)/)).toHaveValue(3.6);
    fireEvent.change(screen.getByLabelText(/Clip starts/), { target: { value: "1.2" } });
    expect(Number((screen.getByLabelText(/Duration \(seconds\)/) as HTMLInputElement).value)).toBeCloseTo(2.4);
    expect(screen.getByRole("button", { name: "Create export" })).toBeEnabled();
  });
  it("blocks short sources and overlong user ranges", async () => {
    await openWithDuration(.7);
    expect(screen.getByRole("button", { name: "Create export" })).toBeDisabled();
    act(() => {
      Object.defineProperty(metadataVideo, "duration", { value: 120, configurable: true });
      metadataVideo.dispatchEvent(new Event("loadedmetadata"));
    });
    fireEvent.change(screen.getByLabelText(/Duration \(seconds\)/), { target: { value: "61" } });
    expect(screen.getByRole("button", { name: "Create export" })).toBeDisabled();
  });
  it("clears stale metadata and trims when selecting a different asset", async () => {
    await openWithDuration(3.6);
    fireEvent.change(screen.getByLabelText(/Clip starts/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Source asset"), { target: { value: "b" } });
    expect(screen.getByLabelText(/Clip starts/)).toHaveValue(0);
    expect(screen.getByLabelText(/Duration \(seconds\)/)).toHaveValue(15);
    expect(screen.queryByText(/source: 3.6s/)).not.toBeInTheDocument();
  });
});
