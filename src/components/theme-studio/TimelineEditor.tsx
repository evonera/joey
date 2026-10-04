"use client";
import { useState } from "react";
import { timelineSchema, timelineFrames, type TimelineScene } from "@/lib/media-engine/timeline";
import { soundCuesSchema } from "@/lib/media-engine/sound";
import { TimelineSoundControls, type TimelineSound } from "./TimelineSoundControls";

type Asset = { id: string; filename: string };
export function TimelineEditor({ videos, images, music, sfxEnabled, initialSound, busy, initialScenes, onExport }: { videos: Asset[]; images: Asset[]; music: Asset[]; sfxEnabled: boolean; initialSound?: TimelineSound; busy: boolean; initialScenes?: TimelineScene[]; onExport: (scenes: TimelineScene[], sound: TimelineSound) => void }) {
  const [scenes, setScenes] = useState<TimelineScene[]>(initialScenes ?? [{ kind: "card", headline: "Your opening headline", durationFrames: 90, transition: "cut" }]);
  const [sound, setSound] = useState<TimelineSound>(initialSound ?? { soundCues: [], captions: false });
  const update = (index: number, value: TimelineScene) => setScenes(previous => previous.map((scene, i) => i === index ? value : scene));
  const parsed = timelineSchema.safeParse(scenes);
  const cues = soundCuesSchema.safeParse(sound.soundCues);
  const soundValid = cues.success && sound.soundCues.every(cue => cue.frame < timelineFrames(scenes)) && (sfxEnabled || !sound.soundCues.length);
  function move(index: number, delta: number) {
    setScenes(previous => {
      const next = [...previous];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next.map((scene, i) => i === next.length - 1 ? { ...scene, transition: "cut" } : scene);
    });
  }
  function newScene(kind: TimelineScene["kind"]): TimelineScene {
    const base = { headline: "", durationFrames: 90, transition: "cut" as const };
    return kind === "card" ? { ...base, kind, headline: "Your message" } : { ...base, kind, asset: { id: (kind === "video" ? videos : images)[0]?.id ?? "", version: "resolved-on-server" }, crop: { mode: "contain", x: .5, y: .5 }, ...(kind === "video" ? { trimStartFrame: 0, sourceAudio: true } : {}) } as TimelineScene;
  }
  return <section className="space-y-4" aria-label="Multi-scene timeline">
    <p className="text-sm text-muted-foreground">One to six scenes, up to 60 seconds. Finished MP4 playback is authoritative; scene timing uses 30 fps.</p>
    {scenes.map((scene, index) => <fieldset key={index} className="space-y-3 rounded-lg border p-3" disabled={busy}>
      <legend className="px-1 text-sm font-medium">Scene {index + 1}</legend>
      <label className="block text-sm">Scene type<select className="mt-1 w-full rounded border bg-background p-2" value={scene.kind} onChange={e => update(index, newScene(e.target.value as TimelineScene["kind"]))}><option value="video">Video clip</option><option value="image">Still image</option><option value="card">Title / CTA card</option></select></label>
      {scene.kind !== "card" && <label className="block text-sm">Workspace asset<select className="mt-1 w-full rounded border bg-background p-2" value={scene.asset.id} onChange={e => update(index, { ...scene, asset: { id: e.target.value, version: "resolved-on-server" } })}><option value="">Choose an asset</option>{(scene.kind === "video" ? videos : images).map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>}
      <label className="block text-sm">Headline<input className="mt-1 w-full rounded border bg-background p-2" maxLength={500} value={scene.headline} onChange={e => update(index, { ...scene, headline: e.target.value })} /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">Duration (seconds)<input className="mt-1 w-full rounded border bg-background p-2" type="number" min={1} max={60} step={1 / 30} value={Number.isFinite(scene.durationFrames) ? scene.durationFrames / 30 : ""} onChange={e => update(index, { ...scene, durationFrames: Math.round(e.target.valueAsNumber * 30) })} /></label>
        {scene.kind === "video" && <label className="text-sm">Trim start (seconds)<input className="mt-1 w-full rounded border bg-background p-2" type="number" min={0} max={86400} step={1 / 30} value={Number.isFinite(scene.trimStartFrame) ? scene.trimStartFrame / 30 : ""} onChange={e => update(index, { ...scene, trimStartFrame: Math.round(e.target.valueAsNumber * 30) })} /></label>}
      </div>
      {scene.kind !== "card" && <label className="block text-sm">Placement<select className="mt-1 w-full rounded border bg-background p-2" value={scene.crop.mode} onChange={e => update(index, { ...scene, crop: { ...scene.crop, mode: e.target.value as "contain" | "cover" } })}><option value="contain">Fit entire source</option><option value="cover">Fill and center crop</option></select></label>}
      {scene.kind === "video" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={scene.sourceAudio} onChange={e => update(index, { ...scene, sourceAudio: e.target.checked })} />Keep source audio</label>}
      {index < scenes.length - 1 && <label className="block text-sm">Transition to next scene<select className="mt-1 w-full rounded border bg-background p-2" value={scene.transition} onChange={e => update(index, { ...scene, transition: e.target.value as "cut" | "fade" })}><option value="cut">Cut</option><option value="fade">Fade (0.4 seconds overlap)</option></select></label>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={index === 0} className="rounded border px-3 py-2 disabled:opacity-50" aria-label={`Move scene ${index + 1} earlier`} onClick={() => move(index, -1)}>Move up</button><button type="button" disabled={index === scenes.length - 1} className="rounded border px-3 py-2 disabled:opacity-50" aria-label={`Move scene ${index + 1} later`} onClick={() => move(index, 1)}>Move down</button><button type="button" disabled={scenes.length === 1} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => setScenes(previous => previous.filter((_, i) => i !== index).map((s, i, all) => i === all.length - 1 ? { ...s, transition: "cut" } : s))}>Remove scene {index + 1}</button></div>
    </fieldset>)}
    <button type="button" className="rounded border px-3 py-2 disabled:opacity-50" disabled={busy || scenes.length >= 6} onClick={() => setScenes(previous => [...previous, newScene("card")])}>Add scene</button>
    <p className="text-sm" role="status">Finished duration: {(timelineFrames(scenes) / 30).toFixed(2)}s</p>
    <TimelineSoundControls value={sound} onChange={setSound} enabled={sfxEnabled} frames={timelineFrames(scenes)} music={music} busy={busy} />
    {!soundValid && <p role="alert" className="text-sm text-destructive">Keep cues inside the timeline, ordered and one second apart; remove disabled effects.</p>}
    {!parsed.success && <p role="alert" className="text-sm text-destructive">{parsed.error.issues[0]?.message}</p>}
    <button type="button" disabled={busy || !parsed.success || !soundValid} className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" onClick={() => { if (parsed.success && soundValid) onExport(parsed.data, sound); }}>{busy ? "Queuing…" : "Create timeline export"}</button>
  </section>;
}
