"use client";
import type { SoundCue } from "@/lib/media-engine/sound";
export type TimelineSound = { soundCues: SoundCue[]; captions: boolean; musicAssetId?: string };
export function TimelineSoundControls({ value, onChange, enabled, frames, music, busy = false }: { value: TimelineSound; onChange: (sound: TimelineSound) => void; enabled: boolean; frames: number; music: { id: string; filename: string }[]; busy?: boolean }) {
  return <fieldset disabled={busy} className="space-y-3 rounded-lg border p-3"><legend className="px-1 text-sm font-medium">Audio and captions</legend>
    <label className="block text-sm">Background music<select value={value.musicAssetId ?? ""} onChange={e => onChange({ ...value, musicAssetId: e.target.value || undefined })} className="mt-1 w-full rounded border bg-background p-2"><option value="">No music</option>{music.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.captions} onChange={e => onChange({ ...value, captions: e.target.checked })} />Generate captions from assembled source audio (workspace OpenAI key; provider cost applies)</label>
    {enabled && <>
      <p className="text-sm text-muted-foreground">Effects are optional. Maximum six, at least one second apart. Keep speech clear; listen to the finished export.</p>
      {value.soundCues.map((cue, index) => <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-sm">Effect {index + 1}<select className="mt-1 w-full rounded border bg-background p-2" value={cue.effect} onChange={e => onChange({ ...value, soundCues: value.soundCues.map((c, i) => i === index ? { ...c, effect: e.target.value as SoundCue["effect"] } : c) })}><option value="whoosh">Whoosh</option><option value="pop">Pop</option><option value="ding">Ding</option></select></label>
        <label className="text-sm">At (seconds)<input className="mt-1 w-full rounded border bg-background p-2" type="number" min={0} max={Math.max(0, (frames - 1) / 30)} step={1 / 30} value={Number.isFinite(cue.frame) ? cue.frame / 30 : ""} onChange={e => onChange({ ...value, soundCues: value.soundCues.map((c, i) => i === index ? { ...c, frame: Math.round(e.target.valueAsNumber * 30) } : c) })} /></label>
        <button type="button" className="self-end rounded border px-3 py-2" onClick={() => onChange({ ...value, soundCues: value.soundCues.filter((_, i) => i !== index) })}>Remove cue {index + 1}</button>
      </div>)}
      <div className="flex flex-wrap gap-2"><button type="button" className="rounded border px-3 py-2 disabled:opacity-50" disabled={value.soundCues.length >= 6} onClick={() => onChange({ ...value, soundCues: [...value.soundCues, { effect: "pop", frame: (value.soundCues.at(-1)?.frame ?? -30) + 30, gain: .2 }] })}>Add sound cue</button><button type="button" className="rounded border px-3 py-2" onClick={() => onChange({ ...value, soundCues: frames > 30 ? [{ effect: "whoosh", frame: 0, gain: .15 }, { effect: "ding", frame: Math.min(frames - 1, 60), gain: .15 }] : [{ effect: "pop", frame: 0, gain: .15 }] })}>Sparse intro preset</button><button type="button" className="rounded border px-3 py-2" onClick={() => onChange({ ...value, soundCues: [] })}>Effects off</button></div>
    </>}
  </fieldset>;
}
