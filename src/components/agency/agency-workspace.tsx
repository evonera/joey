"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search01Icon, PlusSignIcon, Settings02Icon, ArrowRight01Icon } from "hugeicons-react";
import { AgentChat } from "@/app/_components/agent-chat";
import { ChatStorageProvider } from "@/components/chat/chat-storage-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAgencyThreads, getAgencyRuns } from "@/app/actions/agency";
import { canOperateAgency } from "@/lib/agency/config";
import { cn } from "@/lib/utils";
import { AgentWizard } from "./agent-wizard";
import { AgentIdentity } from "./agent-identity";
import { AgentAutomationControls } from "./agent-automation-controls";
import type { AgencyAgent, AgencyChoices } from "./types";

type Thread = Awaited<ReturnType<typeof getAgencyThreads>>[number];
type Run = Awaited<ReturnType<typeof getAgencyRuns>>[number];

export function AgencyWorkspace({
  agents,
  choices,
  actor,
}: {
  agents: AgencyAgent[];
  choices: AgencyChoices;
  actor: { tenantId: string; userId: string; role: string };
}) {
  const router = useRouter();
  const [roster, setRoster] = useState(agents);
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [mobileRosterOpen, setMobileRosterOpen] = useState(true);
  const [wizard, setWizard] = useState<"new" | AgencyAgent>();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [historyError, setHistoryError] = useState<string>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const [conversationKey, setConversationKey] = useState(0);
  const selected = roster.find((agent) => agent.id === selectedId && agent.state !== "archived");
  const profileId = selected?.id;
  useEffect(() => {
    setRoster(agents);
  }, [agents]);
  useEffect(() => {
    let cancelled = false;
    setThreads([]);
    setRuns([]);
    setHistoryError(undefined);
    if (!profileId) return;
    setHistoryLoading(true);
    Promise.all([getAgencyThreads(profileId), getAgencyRuns(profileId)])
      .then(([nextThreads, nextRuns]) => {
        if (!cancelled) {
          setThreads(nextThreads);
          setRuns(nextRuns);
        }
      })
      .catch((error) => {
        if (!cancelled) setHistoryError(error instanceof Error ? error.message : "History could not load.");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, selected?.configVersion, historyEpoch]);
  const refreshHistory = useCallback(() => {
    // Refresh via navigation so an old async response can never overwrite a
    // different agent's selected history. Conversations continue on Eve.
    router.refresh();
    setHistoryEpoch((previous) => previous + 1);
  }, [router]);
  const visible = roster.filter(
    (agent) =>
      agent.state !== "archived" && `${agent.name} ${agent.description}`.toLowerCase().includes(query.toLowerCase())
  );
  function save(agent: AgencyAgent) {
    setRoster((previous) => [agent, ...previous.filter((item) => item.id !== agent.id)]);
    setSelectedId(agent.id);
    setMobileRosterOpen(false);
    setWizard(undefined);
    setThreadId(undefined);
    setConversationKey((previous) => previous + 1);
    router.refresh();
  }
  return (
    <section
      aria-label="Agent workspace"
      className="flex h-[calc(100dvh-var(--header-height)-3.5rem)] min-h-0 flex-col overflow-hidden rounded-2xl border bg-card lg:flex-row"
    >
      <aside
        aria-label="Agent roster"
        className="flex max-h-[32dvh] shrink-0 flex-col border-b lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r"
      >
        <header className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-base font-semibold">Your agents</h1>
            {selected && (
              <Button size="sm" variant="ghost" className="ml-auto lg:hidden" aria-expanded={mobileRosterOpen} aria-controls="agency-roster-list" onClick={() => setMobileRosterOpen(previous => !previous)}>
                {mobileRosterOpen ? "Hide agents" : "Show agents"}
              </Button>
            )}
            <Button size="sm" onClick={() => setWizard("new")}>
              <PlusSignIcon className="size-4" />
              New
            </Button>
          </div>
          <label className={cn("relative lg:block", mobileRosterOpen ? "block" : "hidden")}>
            <span className="sr-only">Search agents</span>
            <Search01Icon
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 pl-9"
              placeholder="Search agents"
            />
          </label>
        </header>
        <div id="agency-roster-list" className={cn("min-h-0 flex-1 overflow-y-auto px-2 pb-2 lg:block", mobileRosterOpen ? "block" : "hidden")}>
          {visible.length ? (
            <ul className="space-y-1">
              {visible.map((agent) => (
                <li key={agent.id}>
                  <button
                    type="button"
                    aria-pressed={agent.id === selectedId}
                    onClick={() => {
                      setSelectedId(agent.id);
                      setMobileRosterOpen(false);
                      setThreadId(undefined);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      agent.id === selectedId ? "bg-muted" : "hover:bg-muted/60"
                    )}
                  >
                    <AgentIdentity shape={agent.avatarShape} color={agent.avatarColor} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{agent.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {agent.state === "active" ? "Daily drafts enabled" : "Automation paused"} · {agent.specialty}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              {query ? "No matching agents." : "Create your first focused assistant."}
            </p>
          )}
        </div>
        <Link
          href="/dashboard"
          className="hidden items-center justify-between border-t px-5 py-4 text-xs text-muted-foreground hover:text-foreground lg:flex"
        >
          Open Joey chat
          <ArrowRight01Icon className="size-4" />
        </Link>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <header className="flex shrink-0 items-center justify-between gap-3 border-b p-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <AgentIdentity shape={selected.avatarShape} color={selected.avatarColor} />
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{selected.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    Draft-only · {selected.accountIds.length} destinations ·{" "}
                    {selected.state === "active" ? "daily automation" : "automation paused"}
                  </p>
                </div>
              </div>
              <Button
                aria-label={`Edit ${selected.name}`}
                variant="ghost"
                size="icon"
                disabled={selected.state === "active" && !canOperateAgency(actor.role)}
                onClick={() => setWizard(selected)}
              >
                <Settings02Icon className="size-4" />
              </Button>
            </header>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 text-xs sm:px-5">
              {canOperateAgency(actor.role) && <AgentAutomationControls key={selected.id} agent={selected} choices={choices} onChanged={changed => { setRoster(previous => previous.map(item => item.id === changed.id ? { ...item, ...changed } : item)); refreshHistory(); }} />}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setThreadId(undefined);
                  setConversationKey((previous) => previous + 1);
                }}
              >
                New conversation
              </Button>
              <label className="order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1">
                <span className="sr-only">Resume conversation</span>
                <select
                  aria-label="Resume conversation"
                  className="h-8 w-full min-w-0 rounded-md border bg-background px-2 text-xs"
                  value={threadId ?? ""}
                  disabled={historyLoading || !threads.length}
                  onChange={(event) => {
                    setThreadId(event.target.value || undefined);
                    setConversationKey((previous) => previous + 1);
                  }}
                >
                  <option value="">{historyLoading ? "Loading history…" : "Resume a conversation"}</option>
                  {threads.map((thread) => (
                    <option key={thread.id} value={thread.sessionId}>
                      {thread.title} ·{" "}
                      {thread.configVersion !== selected.configVersion ? "old configuration" : thread.status}
                    </option>
                  ))}
                </select>
              </label>
              <details className="relative ml-auto">
                <summary className="cursor-pointer rounded-md px-2 py-2 text-muted-foreground focus-visible:outline-ring">
                  Run history ({runs.length})
                </summary>
                <div className="absolute right-0 z-20 mt-1 max-h-64 w-64 max-w-[calc(100vw-3rem)] overflow-auto rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
                  {historyLoading ? <p role="status" className="text-muted-foreground">Loading runs…</p> : runs.length ? (
                    runs.map((run) => (
                      <div key={run.id} className="border-b py-2 last:border-0">
                        <p className="font-medium capitalize">{run.status}</p>
                        <p className="mt-1 text-muted-foreground">
                          {run.attempt === 0 ? "Not started" : `Attempt ${run.attempt}`} · v{run.configVersion}
                        </p>
                        {run.error && <p className="mt-1 break-words text-destructive">{run.error}</p>}
                        {run.packageId && (
                          <Link
                          href={run.packageThemePageId ? `/theme-studio/${run.packageThemePageId}` : "/theme-studio"}
                            className="mt-2 inline-block underline"
                          >
                            Review draft in Theme Studio
                          </Link>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No automation runs yet.</p>
                  )}
                </div>
              </details>
            </div>
            {historyError && (
              <p role="alert" className="break-words border-b px-5 py-2 text-xs text-destructive">
                {historyError}{" "}
                <Button variant="link" size="sm" onClick={refreshHistory}>
                  Refresh
                </Button>
              </p>
            )}
            <div className="min-h-0 flex-1">
              <ChatStorageProvider
                key={`${actor.tenantId}:${selected.id}`}
                scope={JSON.stringify([actor.userId, actor.tenantId, selected.id])}
              >
                <AgentChat
                  key={`${selected.id}:${selected.configVersion}:${threadId ?? "new"}:${conversationKey}`}
                  persona={{
                    id: selected.id,
                    name: selected.name,
                    description: selected.description,
                    accountIds: selected.accountIds,
                  }}
                  embedded
                  initialServerSession={threadId ? { sessionId: threadId, streamIndex: 0 } : undefined}
                  onConversationSettled={refreshHistory}
                />
              </ChatStorageProvider>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center">
            <AgentIdentity shape="orbit" color="teal" className="size-16" />
            <h2 className="text-xl font-semibold">Build your creative team</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Give each agent a focus and destination. Research and drafts stay in your workspace; publishing stays with
              you.
            </p>
            <Button onClick={() => setWizard("new")}>Create an agent</Button>
            <Link href="/dashboard" className="text-xs text-muted-foreground underline">
              Continue in Joey chat
            </Link>
          </div>
        )}
      </div>
      {wizard && (
        <AgentWizard
          key={wizard === "new" ? "new" : `${wizard.id}:${wizard.configVersion}`}
          agent={wizard === "new" ? undefined : wizard}
          choices={choices}
          onClose={() => setWizard(undefined)}
          onSaved={save}
        />
      )}
    </section>
  );
}
