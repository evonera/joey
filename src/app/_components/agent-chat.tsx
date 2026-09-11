"use client";

import { useChatStorageScope } from "@/components/chat/chat-storage-provider";

import type { UserContent } from "ai";
import { useEveAgent } from "eve/react";
import {
  AlertCircleIcon,
  PlusSignIcon as PlusIcon,
  CpuIcon as BrainIcon,
  File02Icon as ArtifactIcon,
  ArrowDown01Icon,
  Book02Icon as LibraryIcon,
} from "hugeicons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSelect,
  PromptInputSelectTrigger,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectGroup,
  PromptInputSelectLabel,
  PromptInputSelectSeparator,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { registerAsset, requestUploadUrl } from "@/app/actions/assets";
import { getConfiguredProviders } from "@/app/actions/models";
import {
  getModelById,
  getRecommendedModels,
  getModelsByProvider,
  DEFAULT_MODEL_ID,
} from "@/lib/models";
import Image from "next/image";
import Link from "next/link";
import { Lock, ArrowLeft, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import {
  getStoredSession,
  saveStoredSession,
  calculateSessionTokensAndCost,
  deriveTitleFromMessages,
  type SavedChatSession,
} from "@/lib/chat-sessions";
import { ChatLibraryView } from "@/components/chat/chat-library-view";
import { SocialPlatformSelector } from "@/components/chat/social-platform-selector";
const AgentMessage = dynamic(() => import("./agent-message").then(module => module.AgentMessage), {
  loading: () => <div role="status" className="py-3 text-sm text-muted-foreground">Loading message…</div>,
});
const ChatSidepanel = dynamic(() => import("@/components/chat/chat-sidepanel").then(module => module.ChatSidepanel));

type AgentStatus = ReturnType<typeof useEveAgent>["status"];
type CancellationState = "idle" | "cancelling";

export function AgentChat() {
  const storageScope = useChatStorageScope();
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [sessionKey, setSessionKey] = useState<string>(() => `chat_${Date.now()}`);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  const [activeView, setActiveView] = useState<"chat" | "library">("chat");
  const [isSidepanelOpen, setIsSidepanelOpen] = useState(false);
  const [sidepanelTab, setSidepanelTab] = useState<"artifacts" | "context">("artifacts");

  // Load saved session data when activeSessionId changes
  const activeSavedSession = useMemo(() => {
    if (!activeSessionId) return null;
    return getStoredSession(activeSessionId, storageScope);
  }, [activeSessionId, storageScope]);

  const handleSelectSession = (session: SavedChatSession) => {
    setActiveSessionId(session.id);
    setInitialPrompt(undefined);
    setSessionKey(`session_${session.id}`);
    setActiveView("chat");
  };

  const handleNewChat = (prompt?: string) => {
    setActiveSessionId(undefined);
    setInitialPrompt(prompt);
    setSessionKey(`chat_${Date.now()}`);
    setActiveView("chat");
  };

  const handleToggleSidepanel = (tab?: "artifacts" | "context") => {
    if (!tab) {
      setIsSidepanelOpen((prev) => !prev);
      return;
    }
    setIsSidepanelOpen((prev) => (prev && sidepanelTab === tab ? false : true));
    setSidepanelTab(tab);
  };

  if (activeView === "library") {
    return (
      <div className="flex flex-col h-[calc(100dvh-var(--header-height)-3.5rem)] w-full overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-xs">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-4 sm:px-6 bg-background/50 backdrop-blur-xs">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveView("chat")}
              className="h-8 px-2.5 text-xs font-semibold gap-1.5 hover:bg-muted/50 text-foreground cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              <span>Back to Chat</span>
            </Button>
            <span className="text-border/60">/</span>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <LibraryIcon className="size-3.5 text-primary" />
              <span>Thread Library</span>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => handleNewChat()}
            className="h-8 rounded-full bg-[#ffe633] text-black hover:bg-[#ffe633]/90 font-medium px-3 text-xs gap-1.5 cursor-pointer shadow-xs"
          >
            <PlusIcon className="size-3.5 stroke-[2.5]" />
            <span>New Chat</span>
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <ChatLibraryView
            onSelectThread={handleSelectSession}
            onNewThread={handleNewChat}
            onBackToChat={() => setActiveView("chat")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-var(--header-height)-3.5rem)] w-full overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-xs">
      <AgentChatInner
        key={sessionKey}
        initialSavedSession={activeSavedSession}
        initialPrompt={initialPrompt}
        onSessionCreated={(newId) => setActiveSessionId(newId)}
        onOpenLibrary={() => setActiveView("library")}
        onNewChat={handleNewChat}
        isSidepanelOpen={isSidepanelOpen}
        onToggleSidepanel={handleToggleSidepanel}
        sidepanelTab={sidepanelTab}
        onSidepanelTabChange={setSidepanelTab}
        onCloseSidepanel={() => setIsSidepanelOpen(false)}
      />
    </div>
  );
}

interface AgentChatInnerProps {
  initialSavedSession?: SavedChatSession | null;
  initialPrompt?: string;
  onSessionCreated: (id: string) => void;
  onOpenLibrary: () => void;
  onNewChat: (prompt?: string) => void;
  isSidepanelOpen: boolean;
  onToggleSidepanel: (tab?: "artifacts" | "context") => void;
  sidepanelTab: "artifacts" | "context";
  onSidepanelTabChange: (tab: "artifacts" | "context") => void;
  onCloseSidepanel: () => void;
}

function AgentChatInner({
  initialSavedSession,
  initialPrompt,
  onSessionCreated,
  onOpenLibrary,
  onNewChat,
  isSidepanelOpen,
  onToggleSidepanel,
  sidepanelTab,
  onSidepanelTabChange,
  onCloseSidepanel,
}: AgentChatInnerProps) {
  const storageScope = useChatStorageScope();
  const [cancellationError, setCancellationError] = useState<string>();
  const [cancellationState, setCancellationState] = useState<CancellationState>("idle");
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (initialSavedSession?.model) return initialSavedSession.model;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("joey_preferred_model");
      if (saved) return saved;
    }
    return DEFAULT_MODEL_ID;
  });

  const sessionCreatedAtRef = useRef<string>(
    initialSavedSession?.createdAt || new Date().toISOString()
  );
  const sessionUpdatedAtRef = useRef<string>(
    initialSavedSession?.updatedAt || new Date().toISOString()
  );

  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [hasEnvKeys, setHasEnvKeys] = useState<{
    google: boolean;
    openai: boolean;
    anthropic: boolean;
  }>({
    google: false,
    openai: false,
    anthropic: false,
  });

  useEffect(() => {
    getConfiguredProviders().then((res) => {
      setConfiguredProviders(res.configuredProviders);
      setHasEnvKeys(res.hasEnvKeys);
      if (
        typeof window !== "undefined" &&
        !localStorage.getItem("joey_preferred_model") &&
        !initialSavedSession?.model &&
        res.configuredProviders.includes("google")
      ) {
        setSelectedModel(DEFAULT_MODEL_ID);
      }
    });
  }, [initialSavedSession]);

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    if (typeof window !== "undefined") {
      localStorage.setItem("joey_preferred_model", modelId);
    }
  };

  const agent = useEveAgent({
    headers: async () => ({
      "x-joey-model": selectedModel,
    }),
    initialEvents: initialSavedSession?.events ?? [],
    initialSession: initialSavedSession?.session,
    resume: initialSavedSession?.session !== undefined,
    onSessionChange(session) {
      if (session?.sessionId) {
        onSessionCreated(session.sessionId);
      }
    },
    onFinish(snapshot) {
      if (snapshot.session?.sessionId && snapshot.data.messages.length > 0) {
        const { tokenMetrics, estimatedCostUsd } = calculateSessionTokensAndCost(
          snapshot.data.messages,
          selectedModel
        );
        const existingSession = getStoredSession(snapshot.session.sessionId, storageScope);
        const title = existingSession?.title || deriveTitleFromMessages(snapshot.data.messages);
        sessionUpdatedAtRef.current = new Date().toISOString();

        saveStoredSession({
          id: snapshot.session.sessionId,
          title,
          model: selectedModel,
          createdAt: sessionCreatedAtRef.current,
          updatedAt: sessionUpdatedAtRef.current,
          messageCount: snapshot.data.messages.length,
          tokenMetrics,
          estimatedCostUsd,
          session: snapshot.session,
          events: snapshot.events,
          messages: snapshot.data.messages as any[],
        }, storageScope);
      }
    },
  });

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Record<string, string[]>>({});

  const handleTogglePlatform = (platformId: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId) ? prev.filter((p) => p !== platformId) : [...prev, platformId]
    );
  };

  const handleSelectAccounts = (platformId: string, accountIds: string[]) => {
    setSelectedAccountIds((prev) => ({
      ...prev,
      [platformId]: accountIds,
    }));
  };

  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isEmpty = agent.data.messages.length === 0;
  const errorMessage = cancellationError ?? agent.error?.message;
  const submitStatus =
    agent.status === "resuming" || (isBusy && cancellationState !== "idle")
      ? "submitted"
      : agent.status;

  // Consume seed prompt if placed by open-in-chat buttons
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("joey_seed_prompt");
    if (raw) {
      sessionStorage.removeItem("joey_seed_prompt");
      try {
        const { prompt, autoSend } = JSON.parse(raw);
        if (prompt && autoSend) {
          prepareTurn();
          void agent.send(prompt);
        }
      } catch (err) {
        console.warn("Failed to parse seed prompt:", err);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live token metrics and cost calculated from current active messages
  const liveMetrics = useMemo(() => {
    return calculateSessionTokensAndCost(agent.data.messages, selectedModel);
  }, [agent.data.messages, selectedModel]);

  const sessionTitle = useMemo(() => {
    if (initialSavedSession?.title) return initialSavedSession.title;
    return deriveTitleFromMessages(agent.data.messages);
  }, [initialSavedSession, agent.data.messages]);

  const hasArtifacts = useMemo(() => {
    for (const msg of agent.data.messages as readonly any[]) {
      if (msg.role !== "assistant") continue;
      let text = typeof msg.content === "string" ? msg.content : "";
      if (Array.isArray(msg.parts)) {
        for (const part of msg.parts) {
          if (part.type === "text" && typeof part.text === "string") {
            text += `\n${part.text}`;
          }
        }
      }
      if (/```([a-zA-Z0-9_+#.-]+)?[ \t]*\r?\n([\s\S]*?)```/.test(text)) return true;
    }
    return false;
  }, [agent.data.messages]);

  const prepareTurn = () => {
    setCancellationError(undefined);
    setCancellationState("idle");
  };

  const requestCancellation = useCallback(() => {
    if (!isBusy || cancellationState !== "idle") {
      return;
    }
    setCancellationError(undefined);
    setCancellationState("cancelling");

    void agent.cancel().catch((error: unknown) => {
      setCancellationError(toErrorMessage(error));
      setCancellationState("idle");
    });
  }, [agent, isBusy, cancellationState]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if ((text.length === 0 && message.files.length === 0) || isBusy) return;

    prepareTurn();

    const targetPreamble =
      selectedPlatforms.length > 0
        ? `[Target Channels: ${selectedPlatforms
            .map((p) => {
              const accs = selectedAccountIds[p];
              if (accs !== undefined) {
                return `${p} (accounts: ${accs.length > 0 ? accs.join(",") : "none"})`;
              }
              return p;
            })
            .join("; ")}]\n\n`
        : "";

    const fullText = `${targetPreamble}${text}`.trim();

    if (message.files.length === 0) {
      await agent.send(fullText);
      return;
    }

    const parts: UserContent = [];
    if (fullText.length > 0) {
      parts.push({ text: fullText, type: "text" });
    }
    for (const file of message.files) {
      parts.push({
        data: await uploadToObjectStorage(file),
        filename: file.filename,
        mediaType: file.mediaType,
        type: "file",
      });
    }

    await agent.send(parts);
  };

  const currentModelDef = getModelById(selectedModel);

  const composer = (
    <PromptInput onSubmit={handleSubmit}>
      <PromptInputBody>
        <PromptInputTextarea
          defaultValue={initialPrompt}
          placeholder="Ask Joey to research topics, draft posts, or automate flows…"
        />
        <SocialPlatformSelector
          selectedPlatforms={selectedPlatforms}
          onTogglePlatform={handleTogglePlatform}
          selectedAccountIds={selectedAccountIds}
          onSelectAccounts={handleSelectAccounts}
          className="px-1 pb-1"
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputSelect value={selectedModel} onValueChange={handleModelChange}>
            <PromptInputSelectTrigger className="h-7 text-xs px-2 gap-1.5 border border-border/50 rounded-md bg-background/50 hover:bg-muted/80 transition-colors">
              <span className="font-medium text-foreground">{currentModelDef.name}</span>
            </PromptInputSelectTrigger>
            <PromptInputSelectContent className="w-80 max-h-96">
              <PromptInputSelectGroup>
                <PromptInputSelectLabel>Recommended</PromptInputSelectLabel>
                {getRecommendedModels().map((m) => {
                  const hasKey = configuredProviders.includes(m.provider) || hasEnvKeys[m.provider];
                  return (
                    <PromptInputSelectItem key={m.id} value={m.id} disabled={!hasKey} className="py-2 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span>{m.name}</span>
                          <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            {m.badge}
                          </span>
                          {hasKey ? (
                            <span className="ml-auto size-1.5 rounded-full bg-emerald-500" title="Key active" />
                          ) : (
                            <span className="ml-auto flex items-center" title="API key required">
                              <Lock className="size-3 text-muted-foreground/60" />
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground line-clamp-1">{m.description}</span>
                      </div>
                    </PromptInputSelectItem>
                  );
                })}
              </PromptInputSelectGroup>

              <PromptInputSelectSeparator />

              <PromptInputSelectGroup>
                <PromptInputSelectLabel>
                  Google Gemini {configuredProviders.includes("google") ? "• BYOK Active" : ""}
                </PromptInputSelectLabel>
                {getModelsByProvider("google").map((m) => {
                  const hasKey = configuredProviders.includes(m.provider) || hasEnvKeys[m.provider];
                  return (
                    <PromptInputSelectItem key={m.id} value={m.id} disabled={!hasKey} className="py-1.5 text-xs">
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="font-medium">{m.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">{m.badge}</span>
                          {hasKey ? (
                            <span className="size-1.5 rounded-full bg-emerald-500" title="Key active" />
                          ) : (
                            <span className="flex items-center" title="API key required">
                              <Lock className="size-3 text-muted-foreground/60" />
                            </span>
                          )}
                        </div>
                      </div>
                    </PromptInputSelectItem>
                  );
                })}
              </PromptInputSelectGroup>

              <PromptInputSelectSeparator />

              <PromptInputSelectGroup>
                <PromptInputSelectLabel>
                  OpenAI {configuredProviders.includes("openai") ? "• BYOK Active" : ""}
                </PromptInputSelectLabel>
                {getModelsByProvider("openai").map((m) => {
                  const hasKey = configuredProviders.includes(m.provider) || hasEnvKeys[m.provider];
                  return (
                    <PromptInputSelectItem key={m.id} value={m.id} disabled={!hasKey} className="py-1.5 text-xs">
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="font-medium">{m.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">{m.badge}</span>
                          {hasKey ? (
                            <span className="size-1.5 rounded-full bg-emerald-500" title="Key active" />
                          ) : (
                            <span className="flex items-center" title="API key required">
                              <Lock className="size-3 text-muted-foreground/60" />
                            </span>
                          )}
                        </div>
                      </div>
                    </PromptInputSelectItem>
                  );
                })}
              </PromptInputSelectGroup>

              <PromptInputSelectSeparator />

              <PromptInputSelectGroup>
                <PromptInputSelectLabel>
                  Anthropic {configuredProviders.includes("anthropic") ? "• BYOK Active" : ""}
                </PromptInputSelectLabel>
                {getModelsByProvider("anthropic").map((m) => {
                  const hasKey = configuredProviders.includes(m.provider) || hasEnvKeys[m.provider];
                  return (
                    <PromptInputSelectItem key={m.id} value={m.id} disabled={!hasKey} className="py-1.5 text-xs">
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="font-medium">{m.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">{m.badge}</span>
                          {hasKey ? (
                            <span className="size-1.5 rounded-full bg-emerald-500" title="Key active" />
                          ) : (
                            <span className="flex items-center" title="API key required">
                              <Lock className="size-3 text-muted-foreground/60" />
                            </span>
                          )}
                        </div>
                      </div>
                    </PromptInputSelectItem>
                  );
                })}
              </PromptInputSelectGroup>
            </PromptInputSelectContent>
          </PromptInputSelect>
          <SpeechInput
            onTranscription={(text) => {
              if (isBusy) return;
              prepareTurn();
              void agent.send(text);
            }}
          />
        </PromptInputTools>
        <PromptInputSubmit onStop={requestCancellation} status={submitStatus} />
      </PromptInputFooter>
    </PromptInput>
  );

  return (
    <>
      <main className="flex flex-1 flex-col min-w-0 h-full overflow-hidden bg-background text-foreground relative">
        {/* Top Minimal Navigation Bar */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-3 sm:px-6 bg-background/50 backdrop-blur-xs">
          {/* Left View Switcher Dropdown */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs font-semibold gap-1.5 hover:bg-muted/40 max-w-[220px] sm:max-w-xs truncate"
                >
                  <span className="truncate">
                    {sessionTitle || "New Chat"}
                  </span>
                  <ArrowDown01Icon className="size-3 opacity-60 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 p-1 text-xs">
                <DropdownMenuItem
                  onClick={() => onNewChat()}
                  className="gap-2 text-xs cursor-pointer font-medium"
                >
                  <PlusIcon className="size-3.5 text-primary" />
                  <span>New Chat</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onOpenLibrary}
                  className="gap-2 text-xs cursor-pointer"
                >
                  <LibraryIcon className="size-3.5" />
                  <span>Search Library</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <StatusDot status={agent.status} />
          </div>

          {/* Right Minimal Controls: Sidepanel Toggle */}
          <div className="flex items-center gap-1.5">
            {hasArtifacts && (
              <Button
                type="button"
                variant={isSidepanelOpen && sidepanelTab === "artifacts" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => onToggleSidepanel("artifacts")}
                className="h-8 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                title="View Artifacts"
              >
                <ArtifactIcon className="size-3.5 text-primary" />
                <span className="hidden sm:inline">Artifacts</span>
              </Button>
            )}

            <Button
              type="button"
              variant={isSidepanelOpen && sidepanelTab === "context" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onToggleSidepanel("context")}
              className="h-8 px-2 text-xs gap-1.5 font-mono text-muted-foreground hover:text-foreground"
              title="Context & Cost Inspector (OpenCode)"
            >
              <BrainIcon className="size-3.5 text-primary" />
              <span className="text-[11px]">
                {liveMetrics.tokenMetrics.totalTokens > 0
                  ? `${(liveMetrics.tokenMetrics.totalTokens / 1000).toFixed(1)}k`
                  : "Context"}
              </span>
            </Button>
          </div>
        </header>

        {/* Error / Rate Limit Notification */}
        {errorMessage ? (
          <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2 sm:px-6">
            {errorMessage.includes("rate_limit:trial") || errorMessage.includes("Free AI trial limit reached") ? (
              <div className="rounded-xl border border-border/80 bg-card/95 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Crown className="size-4 text-amber-400 fill-amber-400/20" />
                    <span className="font-semibold text-sm">Limit reached</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground/70">
                    rate_limit:chat
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Free AI trial limit reached. You have used your 3 free generations. Upgrade to a paid plan or add your own API key in Settings to continue.
                </p>
                <div className="mt-3.5 flex flex-wrap items-center gap-3">
                  <Link
                    href="/settings?tab=billing"
                    className="inline-flex items-center justify-center rounded-full bg-[#fed7aa] px-4 py-1.5 text-xs font-semibold text-neutral-900 shadow-sm transition-colors hover:bg-[#fbd09b]"
                  >
                    See plans
                  </Link>
                  <Link
                    href="/settings?tab=keys"
                    className="inline-flex items-center justify-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Add API key
                  </Link>
                  <button
                    type="button"
                    onClick={() => setCancellationError(undefined)}
                    className="ml-auto inline-flex items-center justify-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">Request failed</p>
                  <p className="mt-0.5 text-muted-foreground">{errorMessage}</p>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Chat Conversation Scroll Area */}
        {isEmpty ? null : (
          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6 sm:px-6">
              {agent.data.messages.map((message, index) => (
                <AgentMessage
                  canRespond={!isBusy}
                  isStreaming={
                    agent.status === "streaming" && index === agent.data.messages.length - 1
                  }
                  key={message.id}
                  message={message}
                  onInputResponses={(inputResponses) => {
                    prepareTurn();
                    return agent.respond(inputResponses);
                  }}
                />
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        )}

        {/* Bottom Composer and Empty State */}
        <div
          className={cn(
            "mx-auto w-full px-4 sm:px-6",
            isEmpty
              ? "flex max-w-xl flex-1 flex-col items-center justify-center gap-6 pb-[6vh]"
              : "max-w-3xl shrink-0 pb-6"
          )}
        >
          {isEmpty ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="relative flex items-center justify-center py-1">
                <Image
                  src="/joey-mascot.png"
                  alt="Joey the Cat"
                  width={56}
                  height={56}
                  className="object-contain drop-shadow-[0_4px_16px_rgba(255,230,51,0.25)] transition-transform hover:scale-105"
                  priority
                />
              </div>
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-medium text-[#ffe633]">
                  <span>Joey · Your creative assistant</span>
                </div>
                <h1 className="font-semibold text-2xl sm:text-3xl tracking-tight text-foreground">
                  What are we creating today?
                </h1>
                <p className="whitespace-nowrap text-xs text-muted-foreground sm:text-sm">
                  Ask anything, draft a post, or build an automation. Joey can use your workspace context to help.
                </p>
              </div>
            </div>
          ) : null}

          <div className="w-full">{composer}</div>

        </div>
      </main>

      {/* Scira / Claude-style Right Sidepanel */}
      {isSidepanelOpen && <ChatSidepanel
        isOpen={isSidepanelOpen}
        onClose={onCloseSidepanel}
        activeTab={sidepanelTab}
        onTabChange={onSidepanelTabChange}
        sessionTitle={sessionTitle}
        modelId={selectedModel}
        messages={agent.data.messages}
        tokenMetrics={liveMetrics.tokenMetrics}
        estimatedCostUsd={liveMetrics.estimatedCostUsd}
        createdAt={sessionCreatedAtRef.current}
        updatedAt={sessionUpdatedAtRef.current}
      />}
    </>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to cancel the response.";
}

async function uploadToObjectStorage(file: {
  filename?: string;
  mediaType?: string;
  url: string;
}): Promise<string> {
  const filename = file.filename ?? "attachment";
  const mediaType = file.mediaType ?? "application/octet-stream";
  const { publicUrl, uploadUrl, key } = await requestUploadUrl(filename, mediaType);
  const response = await fetch(file.url);
  const body = await response.blob();
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mediaType },
    body,
  });
  if (!uploadRes.ok) {
    throw new Error("Failed to upload attachment to object storage.");
  }
  await registerAsset({
    filename,
    key,
    mimeType: mediaType,
    size: body.size,
  });
  return publicUrl;
}

function StatusDot({ status }: { readonly status: AgentStatus }) {
  const isLive = status === "submitted" || status === "streaming";
  const tone =
    status === "error"
      ? "bg-destructive"
      : isLive
        ? "bg-emerald-500"
        : status === "ready"
          ? "bg-muted-foreground"
          : "bg-muted-foreground/50";

  return (
    <span className="relative flex size-1.5">
      {isLive ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            tone
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-1.5 rounded-full transition-colors", tone)} />
    </span>
  );
}
