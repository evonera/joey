"use client";
import { useState, useTransition } from "react";
import { confirmEditorialSlot, getDraftSlotSuggestions } from "@/app/actions/editorial-calendar";
import { Button } from "@/components/ui/button";
export function EditorialSuggestions({ draftId, onConfirmed }: { draftId: string; onConfirmed: () => void }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof getDraftSlotSuggestions>> | null>(null);
  const [message, setMessage] = useState(""); const [pending, startTransition] = useTransition();
  return <section className="space-y-2" aria-label="Assisted posting suggestions">
    <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(async () => { setMessage(""); try { setResult(await getDraftSlotSuggestions(draftId)); } catch { setMessage("Couldn’t load suggestions. Try again."); } })}>{pending ? "Working…" : "Suggest posting times"}</Button>
    {result && "error" in result && <p role="alert" className="text-sm">{result.error}</p>}
    {result && "suggestions" in result && <><p className="text-sm">For {result.accountName ?? result.accountId}. Confirming schedules the reviewed draft for publication.</p>{!result.suggestions.length && <p className="text-sm">No available time in your windows within fourteen days.</p>}{result.suggestions.map(slot => <div key={slot.utc} className="space-y-1 rounded border p-2"><p className="text-sm">{slot.local}</p><p className="text-xs text-muted-foreground">{slot.explanation}</p><Button type="button" disabled={pending} onClick={() => startTransition(async () => { try { const saved = await confirmEditorialSlot({ draftId, revision: result.revision, utc: slot.utc }); if (saved.error) setMessage(saved.error); else { setMessage("Schedule confirmed."); onConfirmed(); } } catch { setMessage("Couldn’t confirm. Refresh suggestions before retrying."); } })}>Confirm this publication time</Button></div>)}</>}
    <p role="status" className="text-sm">{message}</p>
  </section>;
}
