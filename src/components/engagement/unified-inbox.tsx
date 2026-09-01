'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUnifiedInbox, markConversationRead, syncUnifiedInbox, type UnifiedInboxActivity, type UnifiedInboxConversation } from "@/app/actions/engagement";
import { ReplyCard } from "@/components/engagement/reply-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createEngagementWebMcpTools, type EngagementWebMcpItem } from "@/lib/engagement-webmcp";
import { useWebMcpTools } from "@/hooks/use-webmcp-tools";
import { IconArrowLeft, IconChevronDown, IconInbox, IconMessageCircle, IconRefresh, IconSearch, IconSparkles, IconStar } from "@tabler/icons-react";

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

export function UnifiedInbox({ initialResult }: { initialResult?: InboxResult }) {
  const initialConversations = initialResult && "conversations" in initialResult ? initialResult.conversations ?? [] : [];
  const initialActivities = initialResult && "activities" in initialResult ? initialResult.activities ?? [] : [];
  const initialSelectedId = initialResult && "selectedConversation" in initialResult ? initialResult.selectedConversation?.id : undefined;
  const [result, setResult] = useState<InboxResult | null>(initialResult ?? null);
  const [loading, setLoading] = useState(!initialResult);
  const [syncing, setSyncing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("active");
  const [selectedId, setSelectedId] = useState<string | undefined>(initialSelectedId);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [pages, setPages] = useState<UnifiedInboxConversation[]>(initialConversations);
  const [activityPages, setActivityPages] = useState<UnifiedInboxActivity[]>(initialActivities);
  const [stagedReplyEdits, setStagedReplyEdits] = useState<Record<string, string>>({});
  const lastLoadedFilterKey = useRef<string | null>(initialResult ? "all||active" : null);
  const loadRequestId = useRef(0);
  const pagesRef = useRef(pages);
  const selectedRef = useRef<UnifiedInboxConversation | null>(null);
  const activitiesRef = useRef(activityPages);
  const selectedItemRef = useRef<EngagementWebMcpItem>(null);
  const stagedReplyEditsRef = useRef(stagedReplyEdits);
  const editingReplyDraftIds = useRef(new Set<string>());

  const load = useCallback(async (options?: { append?: boolean; cursor?: string | null; selected?: string; activityCursor?: string | null; prependActivities?: boolean }) => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    let response: InboxResult;
    try {
      response = await getUnifiedInbox({ status, kind, search, cursor: options?.cursor ?? undefined, activityCursor: options?.activityCursor ?? undefined, selectedConversationId: options?.selected ?? selectedId });
    } catch (error) {
      if (requestId === loadRequestId.current) setLoading(false);
      throw error;
    }
    if (requestId !== loadRequestId.current) return false;
    if (options?.selected && (!("selectedConversation" in response) || response.selectedConversation?.id !== options.selected)) {
      setLoading(false);
      return false;
    }
    setResult(response);
    if ("conversations" in response) {
      const conversations = response.conversations ?? [];
      const responseActivities = response.activities ?? [];
      if (options?.selected) {
        selectedRef.current = response.selectedConversation ?? null;
        selectedItemRef.current = response.selectedEngagementItem ?? null;
        activitiesRef.current = options.prependActivities
          ? [...responseActivities, ...activitiesRef.current]
          : responseActivities;
      }
      if (options?.append) setPages((current) => [...current, ...conversations]);
      else if (!options?.selected) setPages(conversations);
      if (!selectedId && response.selectedConversation?.id) setSelectedId(response.selectedConversation.id);
      setActivityPages((current) => options?.prependActivities ? [...responseActivities, ...current] : responseActivities);
    }
    setLoading(false);
    return true;
  }, [kind, search, selectedId, status]);

  useEffect(() => {
    const filterKey = `${kind}|${search}|${status}`;
    if (lastLoadedFilterKey.current === filterKey) return;
    lastLoadedFilterKey.current = filterKey;
    void load();
  }, [kind, search, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = result && "selectedConversation" in result ? result.selectedConversation : null;
  const selectedItem = result && "selectedEngagementItem" in result ? result.selectedEngagementItem : null;
  const nextCursor = result && "nextCursor" in result ? result.nextCursor : null;
  const olderActivityCursor = result && "olderActivityCursor" in result ? result.olderActivityCursor : null;
  const error = result && "error" in result ? result.error : null;
  pagesRef.current = pages;
  selectedRef.current = selected ?? null;
  activitiesRef.current = activityPages;
  selectedItemRef.current = selectedItem ?? null;
  stagedReplyEditsRef.current = stagedReplyEdits;

  const selectConversationForAgent = useCallback(async (conversationId: string) => {
    const loaded = await load({ selected: conversationId });
    if (!loaded) throw new Error(`Conversation "${conversationId}" could not be established as the visible selection`);
    setSelectedId(conversationId);
    setMobileDetailOpen(true);
  }, [load]);

  const stageReplyEdit = useCallback((replyDraftId: string, content: string) => {
    editingReplyDraftIds.current.add(replyDraftId);
    setStagedReplyEdits((current) => {
      const next = { ...current, [replyDraftId]: content };
      stagedReplyEditsRef.current = next;
      return next;
    });
  }, []);

  const clearStagedReplyEdit = useCallback((replyDraftId: string, expectedContent?: string): boolean => {
    if (expectedContent !== undefined && stagedReplyEditsRef.current[replyDraftId] !== expectedContent) {
      return false;
    }
    setStagedReplyEdits((current) => {
      const next = { ...current };
      delete next[replyDraftId];
      stagedReplyEditsRef.current = next;
      return next;
    });
    return true;
  }, []);

  const reconcileSavedReplyEdit = useCallback((replyDraftId: string, persistedContent: string, expectedStagedContent?: string): boolean => {
    const selectedItem = selectedItemRef.current;
    if (selectedItem?.replyDraft?.id === replyDraftId) {
      selectedItemRef.current = {
        ...selectedItem,
        replyDraft: { ...selectedItem.replyDraft, content: persistedContent },
      };
    }
    setResult((current) => {
      if (!current || !("selectedEngagementItem" in current)) return current;
      const item = current.selectedEngagementItem;
      if (!item?.replyDraft || item.replyDraft.id !== replyDraftId) return current;
      const selectedEngagementItem = {
        ...item,
        replyDraft: { ...item.replyDraft, content: persistedContent },
      };
      return { ...current, selectedEngagementItem };
    });
    return expectedStagedContent === undefined
      ? true
      : clearStagedReplyEdit(replyDraftId, expectedStagedContent);
  }, [clearStagedReplyEdit]);

  const setReplyEditing = useCallback((replyDraftId: string, isEditing: boolean) => {
    if (isEditing) editingReplyDraftIds.current.add(replyDraftId);
    else editingReplyDraftIds.current.delete(replyDraftId);
  }, []);

  const engagementWebMcpTools = useMemo(() => createEngagementWebMcpTools({
    getState: () => ({
      conversations: pagesRef.current,
      selectedConversation: selectedRef.current,
      activities: activitiesRef.current,
      selectedItem: selectedItemRef.current,
      stagedReplyEdits: stagedReplyEditsRef.current,
    }),
    selectConversation: selectConversationForAgent,
    canStageReplyEdit: (replyDraftId) => !editingReplyDraftIds.current.has(replyDraftId),
    stageReplyEdit,
  }), [selectConversationForAgent, stageReplyEdit]);
  const webMcpAvailable = useWebMcpTools(engagementWebMcpTools);
  const stagedReplyCount = Object.keys(stagedReplyEdits).length;

  const selectConversation = async (conversation: UnifiedInboxConversation) => {
    const isAlreadySelected = selectedId === conversation.id;
    setSelectedId(conversation.id);
    setMobileDetailOpen(true);
    if (!isAlreadySelected) await load({ selected: conversation.id });
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
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">Engagement</h1>{webMcpAvailable ? <Badge variant="outline" className="gap-1 border-indigo-300 text-indigo-700 dark:border-indigo-800 dark:text-indigo-300"><IconSparkles className="size-3" />WebMCP ready</Badge> : null}</div><p className="text-sm text-muted-foreground">Comments, direct messages, mentions, reactions, and reviews in one queue.</p></div>
        <Button variant="outline" onClick={sync} disabled={syncing}><IconRefresh className={`size-4 ${syncing ? "animate-spin" : ""}`} />{syncing ? "Syncing…" : "Sync Zernio"}</Button>
      </div>

      {stagedReplyCount > 0 ? <div role="status" data-testid="engagement-webmcp-staged-banner" className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100"><IconSparkles className="size-3.5" /><span className="font-medium">WebMCP staged {stagedReplyCount} {stagedReplyCount === 1 ? "reply edit" : "reply edits"}.</span><span className="text-indigo-700 dark:text-indigo-300">Open each draft and click Save. Approval and sending remain separate.</span></div> : null}

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border bg-background lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className={`${mobileDetailOpen ? "hidden" : "flex"} min-h-[34rem] flex-col border-b lg:flex lg:border-b-0 lg:border-r`}>
          <div className="space-y-3 border-b p-3">
            <form className="relative" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}>
              <IconSearch className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search people or messages" className="pl-9" />
            </form>
            <div className="flex flex-wrap gap-2">
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
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{conversation.lastMessagePreview || "No preview"}</p><div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="capitalize">{conversation.platform}</span><span>·</span>{kindIcon(conversation.kind)}<span className="capitalize">{conversation.kind}</span><time className="ml-auto" dateTime={new Date(conversation.lastActivityAt).toISOString()} suppressHydrationWarning>{new Date(conversation.lastActivityAt).toLocaleDateString()}</time></div>
              </div>
            </button>)}
            {nextCursor ? <Button variant="ghost" className="w-full rounded-none" disabled={loading} onClick={() => void load({ append: true, cursor: nextCursor })}><IconChevronDown className="size-4" />Load older</Button> : null}
          </div>
        </aside>

        <main className={`${mobileDetailOpen ? "block" : "hidden"} min-h-[34rem] min-w-0 overflow-y-auto lg:block`}>
          {!selected ? <div className="flex h-full min-h-[34rem] items-center justify-center p-8 text-center text-sm text-muted-foreground">Select a conversation to see its history.</div> : <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
            <Button variant="ghost" size="sm" className="w-fit lg:hidden" onClick={() => setMobileDetailOpen(false)}><IconArrowLeft className="size-4" />Back to inbox</Button>
            <header className="flex items-center gap-3 border-b pb-4"><div className="flex size-10 items-center justify-center rounded-full bg-muted text-xs font-semibold">{initials(selected.participantName)}</div><div className="min-w-0"><h2 className="truncate font-semibold">{selected.participantName || selected.participantHandle || "Unknown contact"}</h2><p className="text-xs text-muted-foreground capitalize">{selected.platform} · {selected.kind} · {selected.status}</p></div></header>
            <div className="space-y-3">
              {olderActivityCursor ? <Button variant="ghost" className="w-full" disabled={loading} onClick={() => void load({ selected: selected.id, activityCursor: olderActivityCursor, prependActivities: true })}><IconChevronDown className="size-4 rotate-180" />Load older activity</Button> : null}
              {activityPages.map((activity) => { const outgoing = activity.direction === "outgoing"; return <div key={activity.id} className={`flex ${outgoing ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${outgoing ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{!outgoing && activity.actorName ? <p className="mb-1 text-xs font-medium opacity-70">{activity.actorName}</p> : null}<p className={activity.isDeleted ? "italic opacity-60" : "whitespace-pre-wrap"}>{activityLabel(activity)}</p><div className="mt-1 flex items-center justify-end gap-2 text-[10px] opacity-60"><span className="capitalize">{activity.type}</span><time dateTime={new Date(activity.occurredAt).toISOString()} suppressHydrationWarning>{new Date(activity.occurredAt).toLocaleString()}</time>{activity.deliveryStatus ? <span className="capitalize">{activity.deliveryStatus}</span> : null}</div></div></div>; })}
            </div>
            {selectedItem ? <div className="border-t pt-4"><ReplyCard
              item={selectedItem}
              stagedContent={selectedItem.replyDraft ? stagedReplyEdits[selectedItem.replyDraft.id] : undefined}
              onDiscardStagedEdit={selectedItem.replyDraft ? () => clearStagedReplyEdit(selectedItem.replyDraft!.id) : undefined}
              onEditSaved={selectedItem.replyDraft ? (persistedContent, expectedStagedContent) => reconcileSavedReplyEdit(selectedItem.replyDraft!.id, persistedContent, expectedStagedContent) : undefined}
              onEditingChange={setReplyEditing}
              onActionComplete={() => void load({ selected: selected.id })}
            /></div> : null}
          </div>}
        </main>
      </div>
    </div>
  );
}
