"use client";

import * as React from "react";
import { useState } from "react";
import type { EveDynamicToolPart, EveMessagePart } from "eve/react";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Sources,
  SourcesContent,
  SourcesTrigger,
  Source,
} from "@/components/ai-elements/sources";
import {
  Search01Icon as SearchIcon,
  CheckmarkCircle02Icon as CheckCircleIcon,
  ArrowDown01Icon as ChevronDownIcon,
  ArrowUp01Icon as ChevronUpIcon,
  LinkSquare01Icon as ExternalLinkIcon,
  Clock01Icon as ClockIcon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";
import type { AgentInputResponse } from "@/app/_components/agent-message";

export interface ExtractedSource {
  title: string;
  url: string;
  domain: string;
}

export function ExecutionTrace({
  traceParts,
  isStreaming,
  canRespond,
  onInputResponses,
  renderActions,
}: {
  traceParts: EveMessagePart[];
  isStreaming: boolean;
  canRespond: boolean;
  onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  renderActions: (part: EveDynamicToolPart) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(isStreaming);

  // Extract all sources from search tools or source parts
  const sources: ExtractedSource[] = [];
  const searchQueries: string[] = [];

  for (const part of traceParts) {
    if (part.type === "dynamic-tool") {
      const isSearch = part.toolName === "web_search" || part.toolName === "search";
      if (isSearch) {
        if (part.input && typeof part.input === "object" && "query" in part.input) {
          searchQueries.push(String((part.input as any).query));
        }
        if (
          part.output &&
          typeof part.output === "object" &&
          "results" in part.output &&
          Array.isArray((part.output as any).results)
        ) {
          for (const item of (part.output as any).results) {
            if (item.url) {
              try {
                const domain = new URL(item.url).hostname.replace(/^www\./, "");
                sources.push({
                  title: item.title || item.url,
                  url: item.url,
                  domain,
                });
              } catch {
                sources.push({ title: item.url, url: item.url, domain: "source" });
              }
            }
          }
        }
      }
    } else if ((part as any).type === "source-url") {
      const url = (part as any).url;
      try {
        const domain = new URL(url).hostname.replace(/^www\./, "");
        sources.push({
          title: (part as any).title || url,
          url,
          domain,
        });
      } catch {
        sources.push({ title: url, url, domain: "source" });
      }
    }
  }

  // Deduplicate sources by URL
  const uniqueSources = Array.from(new Map(sources.map((s) => [s.url, s])).values());
  const stepCount = traceParts.filter((p) => p.type !== "step-start").length;

  return (
    <div className="my-2 rounded-xl border border-border/50 bg-card/40 overflow-hidden transition-all">
      {/* Scira 2 Folded Trace Summary Header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-xs hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <span className="size-2 rounded-full bg-amber-400 animate-ping" />
          ) : (
            <CheckCircleIcon className="size-3.5 text-emerald-500" />
          )}
          <span className="font-medium text-foreground">
            {isStreaming ? "Working on steps…" : "Worked"}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{stepCount} steps</span>
          {uniqueSources.length > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{uniqueSources.length} sources</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-[11px]">{isOpen ? "Hide" : "Show"}</span>
          {isOpen ? (
            <ChevronUpIcon className="size-3.5 opacity-70" />
          ) : (
            <ChevronDownIcon className="size-3.5 opacity-70" />
          )}
        </div>
      </button>

      {/* Expanded Step Trace */}
      {isOpen && (
        <div className="px-3.5 pb-3.5 pt-1 space-y-3.5 border-t border-border/30 bg-background/30 text-xs">
          {/* Agent Action Chips (Search queries) */}
          {searchQueries.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Agent Actions
              </span>
              <div className="flex flex-wrap gap-1.5">
                {searchQueries.map((q, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 border border-border/40 text-[11px] text-foreground font-mono"
                  >
                    <SearchIcon className="size-2.5 opacity-60" />
                    <span>{q}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sources Card Grid (Scira 2 style) */}
          {uniqueSources.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Sources
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {uniqueSources.slice(0, 6).map((s, idx) => (
                  <a
                    key={idx}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-col p-2 rounded-lg border border-border/40 bg-card/60 hover:bg-muted/60 hover:border-border/80 transition-colors group"
                  >
                    <span className="text-[10px] font-mono text-muted-foreground truncate group-hover:text-amber-500">
                      {s.domain}
                    </span>
                    <span className="text-[11px] font-medium text-foreground truncate mt-0.5">
                      {s.title}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Individual Tool & Reasoning Executions */}
          <div className="space-y-2 pt-1">
            {traceParts.map((part, index) => {
              if (part.type === "reasoning") {
                return (
                  <Reasoning key={`reasoning-${index}`} defaultOpen={false} isStreaming={part.state === "streaming"}>
                    <ReasoningTrigger />
                    <ReasoningContent>{part.text}</ReasoningContent>
                  </Reasoning>
                );
              }

              if (part.type === "dynamic-tool") {
                return (
                  <Tool
                    key={`tool-${index}`}
                    defaultOpen={
                      part.state === "approval-requested" || part.state === "approval-responded"
                    }
                  >
                    <ToolHeader
                      state={part.state}
                      title={part.toolName}
                      toolName={part.toolName}
                      type="dynamic-tool"
                    />
                    <ToolContent>
                      <ToolInput input={part.input} />
                      {renderActions(part)}
                      <ToolOutput errorText={part.errorText} output={part.output} />
                    </ToolContent>
                  </Tool>
                );
              }

              return null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
