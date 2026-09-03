"use client";

import type { UserContent } from "ai";
import { useEveAgent } from "eve/react";
import { AlertCircleIcon } from "hugeicons-react";
import { useCallback, useEffect, useState } from "react";
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
import { registerAsset, requestUploadUrl } from "@/app/actions/assets";
import { getConfiguredProviders } from "@/app/actions/models";
import {
  getModelById,
  getRecommendedModels,
  getModelsByProvider,
  DEFAULT_MODEL_ID,
} from "@/lib/models";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { AgentMessage } from "./agent-message";

type AgentStatus = ReturnType<typeof useEveAgent>["status"];
type CancellationState = "idle" | "cancelling";

export function AgentChat() {
  const [cancellationError, setCancellationError] = useState<string>();
  const [cancellationState, setCancellationState] = useState<CancellationState>("idle");
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("joey_preferred_model");
      if (saved) return saved;
    }
    return DEFAULT_MODEL_ID;
  });
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [hasEnvKeys, setHasEnvKeys] = useState<{ google: boolean; openai: boolean; anthropic: boolean }>({
    google: false,
    openai: false,
    anthropic: false,
  });

  useEffect(() => {
    getConfiguredProviders().then((res) => {
      setConfiguredProviders(res.configuredProviders);
      setHasEnvKeys(res.hasEnvKeys);
      // If user has a google key configured and hasn't explicitly chosen another, default to Gemini 2.5 Flash
      if (typeof window !== "undefined" && !localStorage.getItem("joey_preferred_model") && res.configuredProviders.includes("google")) {
        setSelectedModel("google/gemini-2.5-flash");
      }
    });
  }, []);

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
  });
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isEmpty = agent.data.messages.length === 0;
  const errorMessage = cancellationError ?? agent.error?.message;
  const submitStatus =
    agent.status === "resuming" || (isBusy && cancellationState !== "idle")
      ? "submitted"
      : agent.status;

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

    // The hook waits for the active response to identify its turn when
    // necessary and sends one guarded cancellation request.
    void agent.cancel().catch((error: unknown) => {
      setCancellationError(toErrorMessage(error));
      setCancellationState("idle");
    });
  }, [agent, isBusy, cancellationState]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if ((text.length === 0 && message.files.length === 0) || isBusy) return;

    prepareTurn();

    if (message.files.length === 0) {
      await agent.send(text);
      return;
    }

    const parts: UserContent = [];
    if (text.length > 0) {
      parts.push({ text, type: "text" });
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
        <PromptInputTextarea placeholder="Send a message…" />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputSelect value={selectedModel} onValueChange={handleModelChange}>
            <PromptInputSelectTrigger className="h-7 text-xs px-2 gap-1.5 border border-border/50 rounded-md bg-background/50 hover:bg-muted/80 transition-colors">
              <span className="font-medium text-foreground">{currentModelDef.name}</span>
              {currentModelDef.recommended && (
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded">
                  Cheap
                </span>
              )}
            </PromptInputSelectTrigger>
            <PromptInputSelectContent className="w-80 max-h-96">
              <PromptInputSelectGroup>
                <PromptInputSelectLabel>⚡ Recommended (Fast & Cheap)</PromptInputSelectLabel>
                {getRecommendedModels().map((m) => {
                  const hasKey = configuredProviders.includes(m.provider) || hasEnvKeys[m.provider];
                  return (
                    <PromptInputSelectItem key={m.id} value={m.id} className="py-2 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span>{m.name}</span>
                          <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            {m.badge}
                          </span>
                          {hasKey && (
                            <span className="ml-auto size-1.5 rounded-full bg-emerald-500" title="Key active" />
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
                {getModelsByProvider("google").map((m) => (
                  <PromptInputSelectItem key={m.id} value={m.id} className="py-1.5 text-xs">
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-[10px] text-muted-foreground">{m.badge}</span>
                    </div>
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectGroup>

              <PromptInputSelectSeparator />

              <PromptInputSelectGroup>
                <PromptInputSelectLabel>
                  OpenAI {configuredProviders.includes("openai") ? "• BYOK Active" : ""}
                </PromptInputSelectLabel>
                {getModelsByProvider("openai").map((m) => (
                  <PromptInputSelectItem key={m.id} value={m.id} className="py-1.5 text-xs">
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-[10px] text-muted-foreground">{m.badge}</span>
                    </div>
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectGroup>

              <PromptInputSelectSeparator />

              <PromptInputSelectGroup>
                <PromptInputSelectLabel>
                  Anthropic {configuredProviders.includes("anthropic") ? "• BYOK Active" : ""}
                </PromptInputSelectLabel>
                {getModelsByProvider("anthropic").map((m) => (
                  <PromptInputSelectItem key={m.id} value={m.id} className="py-1.5 text-xs">
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-[10px] text-muted-foreground">{m.badge}</span>
                    </div>
                  </PromptInputSelectItem>
                ))}
              </PromptInputSelectGroup>
            </PromptInputSelectContent>
          </PromptInputSelect>
        </PromptInputTools>
        <PromptInputSubmit onStop={requestCancellation} status={submitStatus} />
      </PromptInputFooter>
    </PromptInput>
  );

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {isEmpty ? null : (
        <header className="flex h-14 shrink-0 items-center justify-center gap-3 pl-4 pr-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-sm text-foreground">Joey Agent</span>
            <span className="text-xs text-muted-foreground">({currentModelDef.name})</span>
            <StatusDot status={agent.status} />
          </span>
        </header>
      )}

      {errorMessage ? (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2 sm:px-6">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Request failed</p>
              <p className="mt-0.5 text-muted-foreground">{errorMessage}</p>
            </div>
          </div>
        </div>
      ) : null}

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

      <div
        className={cn(
          "mx-auto w-full px-4 sm:px-6",
          isEmpty
            ? "flex max-w-xl flex-1 flex-col items-center justify-center gap-8 pb-[10vh]"
            : "max-w-3xl shrink-0 pb-6",
        )}
      >
        {isEmpty ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="size-16 rounded-2xl bg-[#ffe633]/15 border border-[#ffe633]/30 flex items-center justify-center p-2.5 shadow-sm">
              <Image
                src="/joey-mascot.png"
                alt="Joey"
                width={52}
                height={52}
                className="object-contain"
                priority
              />
            </div>
            <div className="space-y-1.5">
              <h1 className="font-semibold text-2xl sm:text-3xl tracking-tight text-foreground">
                What are we creating today?
              </h1>
              <p className="text-sm text-muted-foreground max-w-sm">
                Ask Joey to draft social posts, research trending angles, review engagement, or automate flows.
              </p>
            </div>
          </div>
        ) : null}
        <div className="w-full">{composer}</div>
      </div>
    </main>
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
    <span className="relative flex size-1">
      {isLive ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            tone,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-1 rounded-full transition-colors", tone)} />
    </span>
  );
}
