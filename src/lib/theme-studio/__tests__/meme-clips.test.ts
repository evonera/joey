import { describe, it, expect } from "vitest";
import { 
  getCuratedMemeClips, 
  getMemeClipById, 
  getClipsByCategory, 
  searchMemeClips 
} from "../assets/meme-clips";

describe("Theme Studio - Curated Meme Clips Catalog", () => {
  it("provides a rich library of clips across all categories", () => {
    const clips = getCuratedMemeClips();
    expect(clips.length).toBeGreaterThanOrEqual(10);

    const categories = new Set(clips.map((c) => c.category));
    expect(categories.has("streamer")).toBe(true);
    expect(categories.has("cinema")).toBe(true);
    expect(categories.has("reaction")).toBe(true);
    expect(categories.has("gaming_loop")).toBe(true);
    expect(categories.has("b_roll")).toBe(true);
  });

  it("finds specific clips by unique ID", () => {
    const speedClip = getMemeClipById("ishowspeed_shock_bark");
    expect(speedClip).toBeDefined();
    expect(speedClip?.speaker).toBe("IShowSpeed");
    expect(speedClip?.aspectRatio).toBe("9:16");

    const officeParkour = getMemeClipById("the_office_parkour");
    expect(officeParkour).toBeDefined();
    expect(officeParkour?.quote).toContain("Parkour!");
  });

  it("filters clips by category correctly", () => {
    const streamers = getClipsByCategory("streamer");
    expect(streamers.length).toBeGreaterThanOrEqual(3);
    expect(streamers.every((c) => c.category === "streamer")).toBe(true);

    const loops = getClipsByCategory("gaming_loop");
    expect(loops.length).toBeGreaterThanOrEqual(3);
    expect(loops.some((c) => c.id === "subway_surfers_loop")).toBe(true);
  });

  it("searches by dialogue quote", () => {
    const results = searchMemeClips("danger");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe("breaking_bad_i_am_the_danger");
    expect(results[0].speaker).toBe("Walter White");
  });

  it("searches by streamer name", () => {
    const kaiResults = searchMemeClips("Kai Cenat");
    expect(kaiResults.length).toBeGreaterThanOrEqual(1);
    expect(kaiResults[0].id).toBe("kai_cenat_celebration_hype");

    const speedResults = searchMemeClips("speed");
    expect(speedResults.length).toBeGreaterThanOrEqual(1);
    expect(speedResults[0].id).toBe("ishowspeed_shock_bark");
  });

  it("searches by emotion tags", () => {
    const rageClips = searchMemeClips("rage");
    expect(rageClips.length).toBeGreaterThanOrEqual(2);
    expect(rageClips.some((c) => c.id === "jynxzi_headset_slam_rage")).toBe(true);

    const cringeClips = searchMemeClips("cringe");
    expect(cringeClips.some((c) => c.id === "the_office_cringe")).toBe(true);
  });

  it("formats R2 public clip URLs consistently", () => {
    const clip = getMemeClipById("ishowspeed_shock_bark");
    expect(clip?.videoUrl).toContain("public-clips/streamers/ishowspeed_shock_bark.mp4");
  });
});
