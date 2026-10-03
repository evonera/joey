import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineEditor } from "../TimelineEditor";
afterEach(cleanup);
const properties = { videos: [], images: [], music: [], sfxEnabled: true, busy: false, onExport: vi.fn() };
describe("Timeline editor acceptance", () => {
  it("starts silent and rejects invalid/cleared timing before submission", () => {
    render(<TimelineEditor {...properties} />);
    fireEvent.click(screen.getByRole("button", { name: "Create timeline export" }));
    expect(properties.onExport).toHaveBeenLastCalledWith(expect.any(Array), { soundCues: [], captions: false });
    fireEvent.change(screen.getByLabelText("Duration (seconds)"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Create timeline export" })).toBeDisabled();
  });
  it("preserves scene order, forces the final cut, and applies an editable sparse preset", () => {
    render(<TimelineEditor {...properties} />);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Opening" } });
    fireEvent.click(screen.getByRole("button", { name: "Add scene" }));
    fireEvent.change(screen.getByLabelText("Transition to next scene"), { target: { value: "fade" } });
    fireEvent.click(screen.getByRole("button", { name: "Move scene 2 earlier" }));
    fireEvent.click(screen.getByRole("button", { name: "Sparse intro preset" }));
    fireEvent.click(screen.getByRole("button", { name: "Create timeline export" }));
    expect(properties.onExport).toHaveBeenLastCalledWith([expect.objectContaining({ headline: "Your message" }), expect.objectContaining({ headline: "Opening", transition: "cut" })], expect.objectContaining({ soundCues: [expect.objectContaining({ frame: 0 }), expect.objectContaining({ frame: 60 })] }));
  });
  it("disables scene and sound edits while queuing; does not expose disabled effects", () => {
    const view = render(<TimelineEditor {...properties} busy />);
    expect(screen.getByLabelText("Background music")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sparse intro preset" })).toBeDisabled();
    view.rerender(<TimelineEditor {...properties} sfxEnabled={false} />);
    expect(screen.queryByRole("button", { name: "Sparse intro preset" })).not.toBeInTheDocument();
  });
});
