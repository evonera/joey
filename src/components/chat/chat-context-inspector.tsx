"use client";

import * as React from "react";
import {
  Download01Icon as DownloadIcon,
  ArrowDown01Icon as ChevronDownIcon,
  ArrowUp01Icon as ChevronUpIcon,
  CpuIcon as BrainIcon,
  Tick02Icon as CheckIcon,
  Copy01Icon as CopyIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getModelById } from "@/lib/models";
import type { SavedChatSession, TokenMetrics } from "@/lib/chat-sessions";

interface ChatContextInspectorProps {
  sessionTitle: string;
  modelId: string;
  messages: readonly any[];
  tokenMetrics: TokenMetrics;
  estimatedCostUsd: number;
  createdAt?: string;
  updatedAt?: string;
  onExportSession?: () => void;
  className?: string;
}

export function ChatContextInspector({
  sessionTitle,
  modelId,
  messages,
  tokenMetrics,
  estimatedCostUsd,
  createdAt,
  updatedAt,
  onExportSession,
  className,
}: ChatContextInspectorProps) {
  const modelDef = getModelById(modelId);
  const contextLimit = modelDef.contextWindowTokens;
  const usagePercentage = Math.min(
    100,
    Math.round((tokenMetrics.totalTokens / contextLimit) * 100)
  );

  const userMessagesCount = messages.filter((m) => m.role === "user").length;
  const assistantMessagesCount = messages.filter((m) => m.role === "assistant").length;

  const [expandedMsgId, setExpandedMsgId] = React.useState<string | null>(null);
  const [copiedRaw, setCopiedRaw] = React.useState(false);

  const handleExport = () => {
    if (onExportSession) {
      onExportSession();
      return;
    }
    const exportData = {
      title: sessionTitle,
      model: modelDef.name,
      modelId,
      exportedAt: new Date().toISOString(),
      tokenMetrics,
      estimatedCostUsd,
      messages,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `joey-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyRaw = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "Just now";
    try {
      const d = new Date(isoString);
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className={cn("flex flex-col gap-6 p-4 text-xs font-sans", className)}>
      {/* 2-Column Metrics Grid matching OpenCode Context Tab */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {/* Row 1 */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Session</span>
          <span className="font-semibold text-foreground truncate max-w-full" title={sessionTitle}>
            {sessionTitle}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Messages</span>
          <span className="font-mono font-medium text-foreground">{messages.length}</span>
        </div>

        {/* Row 2 */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Provider</span>
          <span className="font-medium capitalize text-foreground">{modelDef.provider}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Model</span>
          <span className="font-medium text-foreground truncate">{modelDef.name}</span>
        </div>

        {/* Row 3 */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Context Limit</span>
          <span className="font-mono text-foreground">{contextLimit.toLocaleString()}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Total Tokens</span>
          <span className="font-mono font-medium text-foreground">
            {tokenMetrics.totalTokens.toLocaleString()}
          </span>
        </div>

        {/* Row 4 */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Usage</span>
          <span className="font-mono text-foreground">{usagePercentage}%</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Input Tokens</span>
          <span className="font-mono text-foreground">{tokenMetrics.inputTokens.toLocaleString()}</span>
        </div>

        {/* Row 5 */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Output Tokens</span>
          <span className="font-mono text-foreground">{tokenMetrics.outputTokens.toLocaleString()}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Reasoning Tokens</span>
          <span className="font-mono text-foreground">
            {tokenMetrics.reasoningTokens.toLocaleString()}
          </span>
        </div>

        {/* Row 6 */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Cache Tokens (read/write)</span>
          <span className="font-mono text-foreground">
            {tokenMetrics.cacheTokens.toLocaleString()} / 0
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">User Messages</span>
          <span className="font-mono text-foreground">{userMessagesCount}</span>
        </div>

        {/* Row 7 */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Assistant Messages</span>
          <span className="font-mono text-foreground">{assistantMessagesCount}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Total Cost</span>
          <span className="font-mono font-semibold text-foreground">
            {estimatedCostUsd === 0 ? "$0.00" : `$${estimatedCostUsd.toFixed(4)}`}
          </span>
        </div>

        {/* Row 8 */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Session Created</span>
          <span className="text-muted-foreground text-[11px]">{formatDate(createdAt)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Last Activity</span>
          <span className="text-muted-foreground text-[11px]">{formatDate(updatedAt)}</span>
        </div>
      </div>

      {/* Context Breakdown Segmented Bar */}
      <div className="space-y-2 border-t border-border/40 pt-4">
        <h4 className="text-xs font-semibold text-foreground">Context Breakdown</h4>
        <div className="h-2 w-full flex rounded-full overflow-hidden bg-muted/40">
          <div
            style={{ width: `${Math.max(1, tokenMetrics.userPercent)}%` }}
            className="bg-emerald-500 transition-all duration-300"
            title={`User: ${tokenMetrics.userPercent}%`}
          />
          <div
            style={{ width: `${Math.max(1, tokenMetrics.assistantPercent)}%` }}
            className="bg-rose-400 transition-all duration-300"
            title={`Assistant: ${tokenMetrics.assistantPercent}%`}
          />
          <div
            style={{ width: `${Math.max(1, tokenMetrics.toolCallsPercent)}%` }}
            className="bg-amber-400 transition-all duration-300"
            title={`Tool Calls: ${tokenMetrics.toolCallsPercent}%`}
          />
          <div
            style={{ width: `${Math.max(0, tokenMetrics.otherPercent)}%` }}
            className="bg-muted-foreground/30 transition-all duration-300"
            title={`Other: ${tokenMetrics.otherPercent}%`}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span>User {tokenMetrics.userPercent}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-rose-400" />
            <span>Assistant {tokenMetrics.assistantPercent}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-400" />
            <span>Tool Calls {tokenMetrics.toolCallsPercent}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/40" />
            <span>Other {tokenMetrics.otherPercent}%</span>
          </div>
        </div>
      </div>

      {/* Raw Messages Inspector */}
      <div className="space-y-3 border-t border-border/40 pt-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground">Raw messages</h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleExport}
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <DownloadIcon className="size-3.5" />
            <span>Export session</span>
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          {messages.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2 italic">
              No messages in this session yet.
            </p>
          ) : (
            messages.map((msg, idx) => {
              const msgId = msg.id || `msg_${idx}`;
              const isExpanded = expandedMsgId === msgId;
              const textContent = extractMessageText(msg);

              return (
                <div
                  key={msgId}
                  className="flex flex-col rounded-lg border border-border/40 bg-muted/15 overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedMsgId(isExpanded ? null : msgId)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-medium text-foreground text-[11px]">
                        {msg.role}
                      </span>
                      <span className="text-muted-foreground text-[10px]">·</span>
                      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px]">
                        {msg.id || `turn_${idx}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(msg.createdAt)}
                      </span>
                      {isExpanded ? (
                        <ChevronUpIcon className="size-3 text-muted-foreground" />
                      ) : (
                        <ChevronDownIcon className="size-3 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-border/30 bg-background/50 p-3 space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Content ({textContent.length} chars)</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px] gap-1"
                          onClick={() => handleCopyRaw(textContent)}
                        >
                          {copiedRaw ? (
                            <>
                              <CheckIcon className="size-2.5 text-emerald-500" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <CopyIcon className="size-2.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </Button>
                      </div>
                      <pre className="font-mono text-[11px] whitespace-pre-wrap break-words max-h-48 overflow-y-auto rounded bg-muted/20 p-2 text-foreground/90">
                        {textContent || JSON.stringify(msg, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function extractMessageText(msg: any): string {
  if (typeof msg.content === "string") {
    return msg.content;
  }
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .map((p: any) => {
        if (p.type === "text" && typeof p.text === "string") return p.text;
        if (p.type === "reasoning" && typeof p.reasoning === "string") return `[Thinking: ${p.reasoning}]`;
        if (p.type?.startsWith("tool-") || p.type === "action") return `[Tool: ${p.toolName || p.actionName || p.type}]`;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}
