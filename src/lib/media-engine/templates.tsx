import { renderToReadableStream } from "react-dom/server.edge";
import { renderDimensions, type RenderSpec } from "./spec";

/** Trusted templates only. React escapes all user text and attribute values. */
export async function renderTemplateHtml(spec: RenderSpec, card = false) {
  const video = spec.format === "mp4";
  const { height } = renderDimensions(spec);
  const design = spec.design ?? {};
  const font = design.fontFamily ?? (video ? "Inter" : "Anton");
  const titleSize = design.titleSize ? design.titleSize * (video ? 2 : 3) : video ? 54 : 94;
  const words = design.highlightWords ?? [];
  const escapedWords = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = escapedWords.length ? spec.title.split(new RegExp(`(${escapedWords.join("|")})`, "gi")) : [spec.title];
  const minimal = spec.template === "minimal_meme";
  const videoRect = minimal ? { x: 40, y: 640, width: 1000, height: 900 } : { x: 60, y: 650, width: 960, height: 1000 };
  const stream = await renderToReadableStream(
    <main style={{ width: 1080, height, position: "relative", overflow: "hidden", color: design.textColor ?? "white", background: video && !card ? "transparent" : design.bgType === "gradient" ? design.backgroundGradient : design.backgroundColor ?? "#111" }}>
      {!video && design.bgType !== "solid" && design.bgType !== "gradient" && <img src="media" style={{ width: "100%", height: "100%", objectFit: spec.crop.mode, objectPosition: `${spec.crop.x * 100}% ${spec.crop.y * 100}%` }} alt="" />}
      {!video && design.bgType !== "solid" && design.bgType !== "gradient" && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,transparent 25%,rgba(0,0,0,.15) 45%,rgba(0,0,0,.9) 77%,#000 100%)" }} />}
      {spec.template === "photo_inset" && <img src="inset" alt="" style={{ position: "absolute", left: 48, top: 48, width: 350, height: 350, objectFit: "cover", borderRadius: "50%", border: "7px solid white" }} />}
      {video && !minimal && <header id="brand-header" style={{ position: "absolute", left: 64, top: 240, width: 952, display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ background: spec.brand.accent, color: "#111", width: 80, height: 80, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 36 }}>{spec.brand.name.slice(0, 1)}</div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 34, overflowWrap: "anywhere" }}>{spec.brand.name}</div><div style={{ color: "#aaa", fontSize: 26 }}>{spec.brand.handle}</div></div>
      </header>}
      <section style={{ position: "absolute", left: 56, right: 56, top: card ? 740 : video ? 410 : undefined, bottom: video ? undefined : 70, height: card ? 500 : video ? 205 : Math.min(530, height * .48), display: "flex", flexDirection: "column", gap: 26 }}>
        {!video && design.showDivider !== false && <div id="brand-strip" style={{ display: "flex", gap: 20, alignItems: "center", height: 30, flexShrink: 0 }}><div style={{ height: 1, background: "#999", flex: 1 }} /><span style={{ color: spec.brand.accent, fontSize: 22 }}>{spec.brand.name}</span><div style={{ height: 1, background: "#999", flex: 1 }} /></div>}
        <div id="headline-box" style={{ flex: 1, minHeight: 0 }}><h1 id="headline" style={{ margin: 0, textAlign: "center", fontFamily: `${font}, JoeyEmoji`, fontWeight: video ? 500 : 400, fontSize: titleSize, lineHeight: video ? 1.18 : 1.08, textTransform: video ? "none" : "uppercase", overflowWrap: "anywhere" }}>{parts.map((part, index) => <span key={index} style={words.some(word => word.toLowerCase() === part.toLowerCase()) ? { color: spec.brand.accent } : undefined}>{part}</span>)}</h1></div>
        {!video && spec.body && <div id="body-copy" style={{ flexShrink: 0, maxHeight: height * .16, fontSize: (design.bodySize ?? 16) * 1.5, lineHeight: 1.35, textAlign: "center", overflowWrap: "anywhere" }}>{spec.body}</div>}
      </section>
      {design.showWatermark !== false && <footer id="brand-footer" style={{ position: "absolute", bottom: video ? 190 : 24, left: 56, right: 56, textAlign: "center", fontSize: 22, color: "#aaa" }}>{spec.brand.handle}</footer>}
    </main>
  );
  const markup = await new Response(stream).text();
  return { videoRect, html: `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:Inter;src:url('Inter.ttf')}@font-face{font-family:Anton;src:url('Anton.ttf')}@font-face{font-family:JoeyEmoji;src:url('Emoji.ttf')}*{box-sizing:border-box}html,body{margin:0;color:white;font-family:Inter,JoeyEmoji,sans-serif;width:1080px;height:${height}px;background:transparent}</style></head><body>${markup}</body></html>` };
}
