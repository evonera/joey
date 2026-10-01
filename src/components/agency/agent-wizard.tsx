"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Cancel01Icon } from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { agentConfigSchema, type AgencyConfig } from "@/lib/agency/config";
import { saveAgencyAgentAction } from "@/app/actions/agency";
import { AgentIdentity } from "./agent-identity";
import { configFromAgent, type AgencyAgent, type AgencyChoices } from "./types";

export function AgentWizard({
  agent,
  choices,
  onClose,
  onSaved,
}: {
  agent?: AgencyAgent;
  choices: AgencyChoices;
  onClose: () => void;
  onSaved: (agent: AgencyAgent) => void;
}) {
  const [config, setConfig] = useState<AgencyConfig>(() =>
    agent ? configFromAgent(agent) : agentConfigSchema.parse({ name: "New agent" })
  );
  const [name, setName] = useState(agent?.name ?? "");
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  function change<K extends keyof AgencyConfig>(key: K, value: AgencyConfig[K]) {
    setConfig((previous) => ({ ...previous, [key]: value }));
    setError(undefined);
  }
  function advance() {
    setError(undefined);
    if (step === 0 && (!name.trim() || name.trim().length > 80)) {
      setError("Give your agent a name (1–80 characters).");
      return;
    }
    const valid = agentConfigSchema.safeParse({ ...config, name });
    if (!valid.success) {
      setError(valid.error.issues[0]?.message);
      return;
    }
    setStep((previous) => previous + 1);
  }
  async function save() {
    const valid = agentConfigSchema.safeParse({ ...config, name });
    if (!valid.success) {
      setError(valid.error.issues[0]?.message);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      onSaved(
        await saveAgencyAgentAction(valid.data, agent ? { id: agent.id, version: agent.configVersion } : undefined)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this agent. Try again.");
    } finally {
      setSaving(false);
    }
  }
  const selectClass =
    "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-ring";
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xl">
          <header className="flex items-start justify-between gap-3 border-b p-5">
            <div>
              <Dialog.Title className="text-lg font-semibold">{agent ? "Edit agent" : "Create an agent"}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                A focused teammate. Drafts always need human review.
              </Dialog.Description>
            </div>
            <Button aria-label="Close agent setup" variant="ghost" size="icon" disabled={saving} onClick={onClose}>
              <Cancel01Icon className="size-4" />
            </Button>
          </header>
          <ol aria-label="Setup progress" className="grid grid-cols-3 gap-2 border-b px-5 py-3 text-xs">
            {["Identity", "Destinations", "Review"].map((label, index) => (
              <li
                key={label}
                aria-current={step === index ? "step" : undefined}
                className={step === index ? "font-medium text-foreground" : "text-muted-foreground"}
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
          <div className="space-y-5 overflow-y-auto p-5">
            {step === 0 && (
              <>
                <div className="flex items-center gap-4">
                  <AgentIdentity shape={config.avatarShape} color={config.avatarColor} className="size-16" />
                  <p className="text-sm text-muted-foreground">Make this agent easy to recognize in your workspace.</p>
                </div>
                <label className="block space-y-2 text-sm font-medium">
                  Name
                  <Input
                    autoFocus
                    value={name}
                    maxLength={80}
                    onChange={(event) => {
                      setName(event.target.value);
                      setError(undefined);
                    }}
                    placeholder="e.g. Studio editor"
                  />
                </label>
                <label className="block space-y-2 text-sm font-medium">
                  Focus
                  <select
                    value={config.specialty}
                    onChange={(event) => change("specialty", event.target.value as AgencyConfig["specialty"])}
                    className={selectClass}
                  >
                    <option value="writer">Writing & brand voice</option>
                    <option value="researcher">Research & evidence</option>
                    <option value="scout">Instagram Scout</option>
                  </select>
                </label>
                <label className="block space-y-2 text-sm font-medium">
                  Brief
                  <Textarea
                    value={config.description}
                    maxLength={600}
                    rows={3}
                    onChange={(event) => change("description", event.target.value)}
                    placeholder="Audience, tone, and what good work looks like"
                  />
                </label>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Identity</legend>
                  <div className="flex flex-wrap gap-2">
                    {(["orbit", "prism", "ripple"] as const).map((shape) => (
                      <Button
                        key={shape}
                        aria-pressed={config.avatarShape === shape}
                        variant={config.avatarShape === shape ? "secondary" : "outline"}
                        onClick={() => change("avatarShape", shape)}
                        className="capitalize"
                      >
                        {shape}
                      </Button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Tone</legend>
                  <div className="flex flex-wrap gap-2">
                    {(["teal", "violet", "amber", "blue"] as const).map((color) => (
                      <Button
                        key={color}
                        aria-pressed={config.avatarColor === color}
                        aria-label={`${color} identity`}
                        variant={config.avatarColor === color ? "secondary" : "outline"}
                        onClick={() => change("avatarColor", color)}
                        className="capitalize"
                      >
                        {color}
                      </Button>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            {step === 1 && (
              <>
                <fieldset>
                  <legend className="mb-1 text-sm font-medium">Destination accounts</legend>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Only these accounts can receive this agent’s drafts. Research can run without a destination, but
                    saving posts cannot.
                  </p>
                  {choices.accounts.length ? (
                    <div className="space-y-2">
                      {choices.accounts.map((account) => (
                        <label
                          key={account.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={config.accountIds.includes(account.id)}
                            onChange={(event) =>
                              change(
                                "accountIds",
                                event.target.checked
                                  ? [...config.accountIds, account.id]
                                  : config.accountIds.filter((id) => id !== account.id)
                              )
                            }
                          />
                          <span className="min-w-0 truncate">
                            {account.accountName || "Connected account"}
                            <span className="ml-2 text-xs capitalize text-muted-foreground">{account.platform}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      No connected accounts. You can create a research assistant now and add a destination later in
                      Accounts.
                    </p>
                  )}
                </fieldset>
                <label className="block space-y-2 text-sm font-medium">
                  Theme Page
                  <select
                    className={selectClass}
                    value={config.themePageId ?? ""}
                    onChange={(event) => change("themePageId", event.target.value || null)}
                  >
                    <option value="">No Theme Page</option>
                    {choices.pages.map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2 text-sm font-medium">
                  Instagram source
                  <select
                    className={selectClass}
                    value={config.scoutId ?? ""}
                    onChange={(event) => change("scoutId", event.target.value || null)}
                  >
                    <option value="">Chat only — no scheduled Scout</option>
                    {choices.scouts.map((scout) => (
                      <option key={scout.id} value={scout.id}>
                        {scout.name}
                      </option>
                    ))}
                  </select>
                  <span className="block text-xs font-normal text-muted-foreground">
                    Only paused Instagram Scouts are listed. Create or pause one in Social Scouts first.
                  </span>
                </label>
                <label className="block space-y-2 text-sm font-medium">
                  Daily attempt safety ceiling
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={config.dailyDraftLimit}
                    onChange={(event) => change("dailyDraftLimit", Number(event.target.value))}
                  />
                </label>
              </>
            )}
            {step === 2 && (
              <>
                <div className="flex items-center gap-3">
                  <AgentIdentity shape={config.avatarShape} color={config.avatarColor} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{name}</p>
                    <p className="text-xs capitalize text-muted-foreground">{config.specialty} · starts paused</p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm [&>dd]:min-w-0 [&>dd]:break-words">
                  <dt className="text-muted-foreground">Destination accounts</dt>
                  <dd>{config.accountIds.length}</dd>
                  <dt className="text-muted-foreground">Automation ceiling</dt>
                  <dd>{config.dailyDraftLimit} attempts / UTC day</dd>
                  <dt className="text-muted-foreground">Publishing</dt>
                  <dd>Human review only</dd>
                </dl>
                <p className="text-sm text-muted-foreground">
                  Saving does not activate a schedule. Only an owner or admin can approve activation. Editing an active
                  agent pauses it and revokes its previous approval.
                </p>
              </>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>
          <footer className="flex shrink-0 items-center justify-between gap-2 border-t p-5">
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => (step ? setStep((previous) => previous - 1) : onClose())}
            >
              {step ? "Back" : "Cancel"}
            </Button>
            {step < 2 ? (
              <Button onClick={advance}>Continue</Button>
            ) : (
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : agent ? "Save and pause" : "Create paused agent"}
              </Button>
            )}
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
