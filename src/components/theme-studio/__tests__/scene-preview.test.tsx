import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScenePreviewPlayer } from "../video/ScenePreviewPlayer";
import type { VideoPreviewComposition } from "@/lib/theme-studio/renderers/video-scene-spec";

const composition: VideoPreviewComposition = {
  title: "Test", niche: "news", scenes: [
    { id: "one", type: "hook", title: "Opening", narrationText: "Hello", durationInSeconds: 1 },
    { id: "two", type: "cta", title: "Closing", narrationText: "Bye", durationInSeconds: 1 },
  ],
};
afterEach(() => vi.useRealTimers());

describe("honest storyboard preview", () => {
  it("handles empty and unusable scenes without controls", () => {
    const { rerender } = render(<ScenePreviewPlayer composition={{ ...composition, scenes: [] }} />);
    expect(screen.getByText("No storyboard scenes yet.")).toBeInTheDocument();
    rerender(<ScenePreviewPlayer composition={{ ...composition, scenes: [{ ...composition.scenes[0], durationInSeconds: NaN }] }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("labels approximate playback, omits pretend audio, and resets on edits", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ScenePreviewPlayer composition={composition} />);
    expect(screen.getByText(/Storyboard preview/)).toHaveTextContent("no audio");
    expect(screen.queryByRole("button", { name: /mute/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play storyboard" }));
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByRole("heading", { name: "Closing" })).toBeInTheDocument();
    rerender(<ScenePreviewPlayer composition={{ ...composition, title: "Edited" }} />);
    expect(screen.getByRole("heading", { name: "Opening" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play storyboard" })).toBeInTheDocument();
  });
  it("stops at the final scene and can restart", () => {
    vi.useFakeTimers();
    render(<ScenePreviewPlayer composition={composition} />);
    fireEvent.click(screen.getByRole("button", { name: "Play storyboard" }));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole("heading", { name: "Closing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play storyboard" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restart storyboard" }));
    expect(screen.getByRole("heading", { name: "Opening" })).toBeInTheDocument();
  });
});
