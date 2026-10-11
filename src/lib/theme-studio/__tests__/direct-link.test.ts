import { describe, expect, it } from "vitest";
import { directLinkCandidates } from "../direct-link";
import { sourceMediaMime } from "../import-source-media";

describe("direct source links", () => {
  it("discovers both image and video metadata in either attribute order, resolves relative URLs and decodes entities", () => {
    const result = directLinkCandidates('<meta content="/photo.jpg?a=1&amp;b=2" property="og:image"><meta property="og:video" content="https://cdn.example.com/movie.mp4"><video src="/another.mp4"></video>', "https://example.com/post", "owned");
    expect(result.map(item => [item.kind, item.url])).toEqual([["image", "https://example.com/photo.jpg?a=1&b=2"], ["video", "https://cdn.example.com/movie.mp4"], ["video", "https://example.com/another.mp4"]]);
    expect(result.every(item => item.rightsCategory === "owned")).toBe(true);
  });
  it("omits private destinations and executable schemes", () => {
    const result = directLinkCandidates('<meta property="og:image" content="http://127.0.0.1/photo"><source src="file:///private/image"><meta property="og:video" content="javascript:alert(1)">', "https://example.com/post", "owned");
    expect(result).toEqual([]);
  });
  it("sniffs supported video bytes instead of trusting a URL extension or response MIME", () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(4), Buffer.from("isommp42")]);
    expect(sourceMediaMime(mp4, "video")).toEqual({ mime: "video/mp4", extension: "mp4" });
    expect(() => sourceMediaMime(Buffer.from("<html>not a video</html>"), "video")).toThrow("MP4 or WebM");
    expect(() => sourceMediaMime(mp4, "image")).toThrow("image");
  });
});
