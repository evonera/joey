"use client";

import * as React from "react";
import {
  File02Icon as FileIcon,
  CpuIcon as BrainIcon,
  Cancel01Icon as CloseIcon,
  Layers01Icon as LayersIcon,
} from "hugeicons-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Artifact, type ArtifactType } from "@/components/ai-elements/artifact";
import { ChatContextInspector } from "./chat-context-inspector";
import type { TokenMetrics } from "@/lib/chat-sessions";

interface ExtractedArtifact {
  id: string;
  title: string;
  type: ArtifactType;
  language?: string;
  code?: string;
  sourceMessageId?: string;
}

interface ChatSidepanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: "artifacts" | "context";
  onTabChange: (tab: "artifacts" | "context") => void;
  sessionTitle: string;
  modelId: string;
  messages: readonly any[];
  tokenMetrics: TokenMetrics;
  estimatedCostUsd: number;
  createdAt?: string;
  updatedAt?: string;
  className?: string;
}

export function ChatSidepanel({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  sessionTitle,
  modelId,
  messages,
  tokenMetrics,
  estimatedCostUsd,
  createdAt,
  updatedAt,
  className,
}: ChatSidepanelProps) {
  // Extract all code blocks, drafts, or structured artifacts from assistant messages
  const artifacts = React.useMemo<ExtractedArtifact[]>(() => {
    const results: ExtractedArtifact[] = [];
    let count = 0;

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;

      let text = "";
      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.parts)) {
        for (const part of msg.parts) {
          if (part.type === "text" && typeof part.text === "string") {
            text += `\n${part.text}`;
          }
        }
      }

      // Match markdown code blocks: ```lang ... ``` with optional trailing whitespace and special chars (e.g. c++, c#, .env)
      const codeRegex = /```([a-zA-Z0-9_+#.-]+)?[ \t]*\r?\n([\s\S]*?)```/g;
      let match: RegExpExecArray | null;

      while ((match = codeRegex.exec(text)) !== null) {
        count += 1;
        const lang = match[1]?.trim().toLowerCase() || "text";
        const code = match[2]?.trim() || "";

        // Attempt to find a heading preceding this code block
        const preText = text.slice(0, match.index);
        const headingMatch = preText.match(/(?:^|\n)#{1,3}\s+([^\n]+)\s*$/);
        const title = headingMatch
          ? headingMatch[1].trim()
          : `${lang.toUpperCase()} snippet #${count}`;

        let type: ArtifactType = "code";
        if (lang === "svg" || lang === "xml" || code.trim().startsWith("<svg")) type = "svg";
        else if (lang === "html") type = "preview";
        else if (lang === "markdown" || lang === "md") type = "markdown";

        results.push({
          id: `artifact_${msg.id || count}_${count}`,
          title,
          type,
          language: lang,
          code,
          sourceMessageId: msg.id,
        });
      }
    }

    return results;
  }, [messages]);

  const renderPreview = React.useCallback((art: ExtractedArtifact) => {
    if (art.type === "svg") {
      return (
        <div
          className="p-4 flex items-center justify-center bg-[#0d0c0b] rounded-lg overflow-auto max-h-80 border border-border/30 [&>svg]:max-w-full [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: art.code || "" }}
        />
      );
    }
    if (art.type === "preview" || art.language === "html") {
      return (
        <div className="rounded-lg overflow-hidden border border-border/40 bg-white dark:bg-zinc-950">
          <iframe
            title={art.title}
            srcDoc={art.code}
            sandbox="allow-scripts"
            className="w-full h-72 border-0 bg-white"
          />
        </div>
      );
    }
    if (art.type === "markdown") {
      return (
        <div className="p-4 rounded-lg bg-muted/20 border border-border/30 text-xs leading-relaxed whitespace-pre-wrap font-sans text-foreground">
          {art.code}
        </div>
      );
    }
    return undefined;
  }, []);

  if (!isOpen) return null;

  return (
    <aside
      className={cn(
        "flex flex-col h-full w-full max-w-full sm:w-[420px] lg:w-[460px] border-l border-border/50 bg-background/95 backdrop-blur-md shrink-0 shadow-lg transition-all duration-200 z-30",
        className
      )}
    >
      <Tabs
        value={activeTab}
        onValueChange={(val) => onTabChange(val as "artifacts" | "context")}
        className="flex flex-col h-full gap-0"
      >
        {/* Header with Tab switcher and Close button */}
        <div className="flex h-14 items-center justify-between border-b border-border/40 px-3 shrink-0">
          <TabsList className="h-8 p-0.5 bg-muted/40 border border-border/50">
            <TabsTrigger
              value="artifacts"
              className="h-7 px-2.5 text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <FileIcon className="size-3.5" />
              <span>Artifacts</span>
              {artifacts.length > 0 ? (
                <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.2 text-[10px] font-mono font-medium text-primary">
                  {artifacts.length}
                </span>
              ) : null}
            </TabsTrigger>

            <TabsTrigger
              value="context"
              className="h-7 px-2.5 text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <BrainIcon className="size-3.5" />
              <span>Context</span>
              <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                {formatTokenCount(tokenMetrics.totalTokens)}
              </span>
            </TabsTrigger>
          </TabsList>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="size-7 p-0 text-muted-foreground hover:text-foreground"
            title="Close sidepanel"
          >
            <CloseIcon className="size-4" />
          </Button>
        </div>

        {/* Artifacts Tab Content */}
        <TabsContent
          value="artifacts"
          className="flex-1 overflow-y-auto p-4 m-0 space-y-4"
        >
          {artifacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <LayersIcon className="size-9 stroke-1 opacity-40 mb-2.5" />
              <p className="text-xs font-medium text-foreground">No artifacts yet</p>
              <p className="text-[11px] mt-1 max-w-[220px] text-muted-foreground leading-relaxed">
                When Joey drafts social posts, writes code, or produces SVG visuals, they will automatically appear here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
                <span>
                  {artifacts.length} generated artifact{artifacts.length === 1 ? "" : "s"}
                </span>
              </div>
              {artifacts.map((art) => (
                <Artifact
                  key={art.id}
                  title={art.title}
                  type={art.type}
                  language={art.language}
                  code={art.code}
                  preview={renderPreview(art)}
                  className="my-0 border-border/50 bg-muted/10 shadow-xs"
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Context & Cost Tab Content */}
        <TabsContent value="context" className="flex-1 overflow-y-auto m-0 p-0">
          <ChatContextInspector
            sessionTitle={sessionTitle}
            modelId={modelId}
            messages={messages}
            tokenMetrics={tokenMetrics}
            estimatedCostUsd={estimatedCostUsd}
            createdAt={createdAt}
            updatedAt={updatedAt}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return `${tokens}`;
}
