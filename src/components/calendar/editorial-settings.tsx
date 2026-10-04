"use client";
import { useState, useTransition } from "react";
import { saveEditorialPreferences } from "@/app/actions/editorial-calendar";
import type { EditorialPreferences } from "@/lib/editorial-calendar";
import { Button } from "@/components/ui/button";

export function EditorialSettings({ accounts, preferences }: { accounts: { id: string; accountName: string | null; platform: string }[]; preferences: (EditorialPreferences & { accountId: string })[] }) {
  const [accountId, setAccount] = useState(accounts[0]?.id ?? "");
  const initial = preferences.find(p => p.accountId === accountId);
  const [timezone, setTimezone] = useState(initial?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [spacing, setSpacing] = useState(initial?.spacingMinutes ?? 360);
  const [windows, setWindows] = useState(initial?.windows ?? [{ day: 1, startMinute: 540, endMinute: 1020 }]);
  const [message, setMessage] = useState(""); const [pending, startTransition] = useTransition();
  const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const minutes = (value: string) => value.split(":").reduce((total, v, i) => total + Number(v) * (i === 0 ? 60 : 1), 0);
  if (!accounts.length) return <p className="text-sm text-muted-foreground">Connect an account to configure posting suggestions.</p>;
  return <details className="rounded-lg border p-4">
    <summary className="cursor-pointer font-medium">Account posting preferences</summary>
    <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); startTransition(async () => { try { const result = await saveEditorialPreferences(accountId, { timezone, spacingMinutes: spacing, windows }); setMessage(result.error ?? "Preferences saved. Suggestions never publish without confirmation."); } catch { setMessage("Couldn’t save preferences. Try again."); } }); }}>
      <fieldset disabled={pending} className="space-y-3">
        <label className="block text-sm">Account<select value={accountId} className="mt-1 w-full rounded border bg-background p-2" onChange={e => { setAccount(e.target.value); const next = preferences.find(p => p.accountId === e.target.value); setTimezone(next?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone); setSpacing(next?.spacingMinutes ?? 360); setWindows(next?.windows ?? [{ day: 1, startMinute: 540, endMinute: 1020 }]); setMessage(""); }}>{accounts.map(a => <option value={a.id} key={a.id}>{a.accountName ?? a.platform} ({a.platform})</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">IANA timezone<input required value={timezone} onChange={e => setTimezone(e.target.value)} className="mt-1 w-full rounded border bg-background p-2" placeholder="Asia/Kolkata" /></label><label className="text-sm">Minimum spacing (minutes)<input required type="number" min={30} max={1440} value={Number.isFinite(spacing) ? spacing : ""} onChange={e => setSpacing(e.target.valueAsNumber)} className="mt-1 w-full rounded border bg-background p-2" /></label></div>
        <p className="text-xs text-muted-foreground">Choose your own weekly windows. These are preferences, not predictions of peak engagement. Six-hour spacing is an editable starting point.</p>
        {windows.map((window, index) => <div key={index} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Day<select aria-label={`Window ${index + 1} day`} className="block rounded border bg-background p-2" value={window.day} onChange={e => setWindows(windows.map((w, i) => i === index ? { ...w, day: Number(e.target.value) } : w))}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label>
          {(["startMinute", "endMinute"] as const).map(key => <label key={key} className="text-sm">{key === "startMinute" ? "From" : "Until"}<input required aria-label={`Window ${index + 1} ${key === "startMinute" ? "start" : "end"}`} type="time" className="block rounded border bg-background p-2" value={clock(window[key])} onChange={e => setWindows(windows.map((w, i) => i === index ? { ...w, [key]: minutes(e.target.value) } : w))} /></label>)}
          <Button type="button" variant="outline" disabled={windows.length === 1} onClick={() => setWindows(windows.filter((_, i) => i !== index))}>Remove window {index + 1}</Button>
        </div>)}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={windows.length >= 21} onClick={() => setWindows([...windows, { day: 1, startMinute: 540, endMinute: 1020 }])}>Add window</Button><Button type="submit">{pending ? "Saving…" : "Save preferences"}</Button></div>
      </fieldset>
      <p role="status" className="text-sm">{message}</p>
    </form>
  </details>;
}
