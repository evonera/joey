"use client";
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { setAgencyAgentState } from "@/app/actions/agency";
import type { AgencyAgent, AgencyChoices } from "./types";

export function AgentAutomationControls({
  agent,
  choices,
  onChanged,
}: {
  agent: AgencyAgent;
  choices: AgencyChoices;
  onChanged: (agent: AgencyAgent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function change(state: "active" | "paused") {
    setBusy(true);
    setError(undefined);
    try {
      onChanged({ ...agent, ...(await setAgencyAgentState({ id: agent.id, version: agent.configVersion, state })) });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change automation. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || (!agent.scoutId && agent.state !== "active")}
        onClick={() => {
          setError(undefined);
          if (agent.state === "active") void change("paused");
          else setOpen(true);
        }}
      >
        {busy ? "Updating…" : agent.state === "active" ? "Pause automation" : "Enable daily drafts"}
      </Button>
      {!agent.scoutId && agent.state !== "active" && (
        <p className="basis-full text-xs text-muted-foreground">Add an Instagram source in agent settings to enable daily drafts. Chat remains available.</p>
      )}
      {error && !open && (
        <p role="alert" className="basis-full text-xs text-destructive">
          {error}
        </p>
      )}
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card p-5 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Enable daily drafts?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Authorize this exact configuration to check its Scout daily at 05:00 UTC. It can spend Apify, Exa and AI
              credits to prepare drafts, never to publish or schedule posts.
            </Dialog.Description>
            <div className="mt-4 min-h-0 space-y-3 overflow-y-auto break-words text-sm">
              <p>
                Source:{" "}
                {choices.scouts.find((source) => source.id === agent.scoutId)?.name ?? "Configured Instagram Scout"}
              </p>
              <p>
                Review queue:{" "}
                {choices.pages.find((page) => page.id === agent.themePageId)?.name ?? "Configured Theme Page"}
              </p>
              <p>
                Destinations:{" "}
                {agent.accountIds
                  .map(
                    (id) => choices.accounts.find((account) => account.id === id)?.accountName || "Instagram account"
                  )
                  .join(", ")}
              </p>
              <p className="text-muted-foreground">
                One automatic check per UTC day. The {agent.dailyDraftLimit}-attempt ceiling is a safety bound, not a
                promise of that many drafts. Failed attempts count; retries are capped at three.
              </p>
              <p className="text-muted-foreground">
                Pausing blocks new phases and draft commits. A provider request already in progress may finish. Changing
                settings pauses and requires reapproval.
              </p>
              {error && (
                <p role="alert" className="break-words text-destructive">
                  {error}
                </p>
              )}
            </div>
            <div className="mt-5 flex shrink-0 flex-wrap justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void change("active")}>
                {busy ? "Checking setup…" : "Enable draft-only automation"}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
