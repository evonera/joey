'use client';

import { useCallback, useEffect, useState } from "react";
import { getUnifiedInbox, markConversationRead, syncUnifiedInbox, type UnifiedInboxActivity, type UnifiedInboxConversation } from "@/app/actions/engagement";
import { ReplyCard } from "@/components/engagement/reply-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconChevronDown, IconInbox, IconMessageCircle, IconRefresh, IconSearch, IconStar } from "@tabler/icons-react";

type InboxResult = Awaited<ReturnType<typeof getUnifiedInbox>>;

function initials(name: string | null) {
  return (name ?? "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function kindIcon(kind: string) {
  if (kind === "review") return <IconStar className="size-3.5" />;
  if (kind === "comment") return <IconMessageCircle className="size-3.5" />;
  return <IconInbox className="size-3.5" />;
}

function activityLabel(activity: UnifiedInboxActivity) {
  if (activity.isDeleted) return "Message deleted";
  if (activity.type === "reaction") return `Reaction ${activity.body ?? "updated"}`;
  return activity.body || (activity.attachments?.length ? "Attachment" : "No text content");
}

export function UnifiedInbox() {
  const [result, setResult] = useState<InboxResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("active");
  const [selectedId, setSelectedId] = useState<string>();
  const [pages, setPages] = useState<UnifiedInboxConversation[]>([]);
  const [activityPages, setActivityPages] = useState<UnifiedInboxActivity[]>([]);

  const load = useCallback(async (options?: { append?: boolean; cursor?: string | null; selected?: string; activityCursor?: string | null; prependActivities?: boolean }) => {
    setLoading(true);
    const response = await getUnifiedInbox({ status, kind, search, cursor: options?.cursor ?? undefined, activityCursor: options?.activityCursor ?? undefined, selectedConversationId: options?.selected ?? selectedId });
    setResult(response);
    if ("conversations" in response) {
      const conversations = response.conversations ?? [];
      if (options?.append) setPages((current) => [...current, ...conversations]);
      else if (!options?.selected) setPages(conversations);
      if (!selectedId && response.selectedConversation?.id) setSelectedId(response.selectedConversation.id);
      const responseActivities = response.activities ?? [];
      setActivityPages((current) => options?.prependActivities ? [...responseActivities, ...current] : responseActivities);
    }
    setLoading(false);
  }, [kind, search, selectedId, status]);

  useEffect(() => { void load(); }, [kind, search, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = result && "selectedConversation" in result ? result.selectedConversation : null;
  const selectedItem = result && "selectedEngagementItem" in result ? result.selectedEngagementItem : null;
  const nextCursor = result && "nextCursor" in result ? result.nextCursor : null;
  const olderActivityCursor = result && "olderActivityCursor" in result ? result.olderActivityCursor : null;
  const error = result && "error" in result ? result.error : null;

  const selectConversation = async (conversation: UnifiedInboxConversation) => {
    setSelectedId(conversation.id);
    await load({ selected: conversation.id });
    if (conversation.unreadCount > 0) {
      const read = await markConversationRead(conversation.id);
      if (read.success) setPages((current) => current.map((row) => row.id === conversation.id ? { ...row, unreadCount: 0 } : row));
    }
  };

  const sync = async () => {
    setSyncing(true);
    const response = await syncUnifiedInbox();
    setSyncing(false);
    if (response.error) window.alert(response.error);
    else await load();
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Engagement</h1><p className="text-sm text-muted-foreground">Comments, direct messages, mentions, reactions, and reviews in one queue.</p></div>
        <Button variant="outline" onClick={sync} disabled={syncing}><IconRefresh className={`size-4 ${syncing ? "animate-spin" : ""}`} />{syncing ? "Syncing…" : "Sync Zernio"}</Button>
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border bg-background lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="flex min-h-[34rem] flex-col border-b lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b p-3">
            <form className="relative" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}>
              <IconSearch className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search people or messages" className="pl-9" />
            </form>
            <div className="flex gap-2 overflow-x-auto">
              {["all", "dm", "comment", "review"].map((value) => <Button key={value} size="sm" variant={kind === value ? "default" : "outline"} onClick={() => setKind(value)} className="capitalize">{value}</Button>)}
              <Button size="sm" variant={status === "all" ? "default" : "outline"} onClick={() => setStatus((value) => value === "all" ? "active" : "all")}>{status === "all" ? "All status" : "Active"}</Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? <p className="p-6 text-center text-sm text-destructive">{error}</p> : null}
            {!loading && pages.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No conversations match this view.</p> : null}
            {pages.map((conversation) => <button key={conversation.id} onClick={() => void selectConversation(conversation)} className={`flex w-full gap-3 border-b p-3 text-left transition-colors hover:bg-muted/60 ${selectedId === conversation.id ? "bg-muted" : ""}`}>
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold">{conversation.participantAvatar ? <img src={conversation.participantAvatar} alt="" className="size-full object-cover" /> : initials(conversation.participantName)}</div>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{conversation.participantName || conversation.participantHandle || "Unknown contact"}</span>{conversation.unreadCount > 0 ? <Badge className="ml-auto min-w-5 justify-center px-1.5">{conversation.unreadCount}</Badge> : null}</div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{conversation.lastMessagePreview || "No preview"}</p><div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="capitalize">{conversation.platform}</span><span>·</span>{kindIcon(conversation.kind)}<span className="capitalize">{conversation.kind}</span><span className="ml-auto">{new Date(conversation.lastActivityAt).toLocaleDateString()}</span></div>
              </div>
            </button>)}
            {nextCursor ? <Button variant="ghost" className="w-full rounded-none" disabled={loading} onClick={() => void load({ append: true, cursor: nextCursor })}><IconChevronDown className="size-4" />Load older</Button> : null}
          </div>
        </aside>

        <main className="min-h-[34rem] min-w-0 overflow-y-auto">
          {!selected ? <div className="flex h-full min-h-[34rem] items-center justify-center p-8 text-center text-sm text-muted-foreground">Select a conversation to see its history.</div> : <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
            <header className="flex items-center gap-3 border-b pb-4"><div className="flex size-10 items-center justify-center rounded-full bg-muted text-xs font-semibold">{initials(selected.participantName)}</div><div className="min-w-0"><h2 className="truncate font-semibold">{selected.participantName || selected.participantHandle || "Unknown contact"}</h2><p className="text-xs text-muted-foreground capitalize">{selected.platform} · {selected.kind} · {selected.status}</p></div></header>
            <div className="space-y-3">
              {olderActivityCursor ? <Button variant="ghost" className="w-full" disabled={loading} onClick={() => void load({ selected: selected.id, activityCursor: olderActivityCursor, prependActivities: true })}><IconChevronDown className="size-4 rotate-180" />Load older activity</Button> : null}
              {activityPages.map((activity) => { const outgoing = activity.direction === "outgoing"; return <div key={activity.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${outgoing ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{!outgoing && activity.actorName ? <p className="mb-1 text-xs font-medium opacity-70">{activity.actorName}</p> : null}<p className={activity.isDeleted ? "italic opacity-60" : "whitespace-pre-wrap"}>{activityLabel(activity)}</p><div className="mt-1 flex items-center justify-end gap-2 text-[10px] opacity-60"><span className="capitalize">{activity.type}</span><span>{new Date(activity.occurredAt).toLocaleString()}</span>{activity.deliveryStatus ? <span className="capitalize">{activity.deliveryStatus}</span> : null}</div></div></div>; })}
            </div>
            {selectedItem ? <div className="border-t pt-4"><ReplyCard item={selectedItem} onActionComplete={() => void load({ selected: selected.id })} /></div> : null}
          </div>}
        </main>
      </div>
    </div>
  );
}
