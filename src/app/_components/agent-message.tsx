"use client";

import type {
  EveAuthorizationPart,
  EveDynamicToolPart,
  EveMessage,
  EveMessagePart,
} from "eve/react";
import {
  CheckmarkCircle02Icon as CheckCircleIcon,
  LinkSquare01Icon as ExternalLinkIcon,
  File02Icon as FileIcon,
  Image01Icon as ImageIcon,
  Key01Icon as KeyRoundIcon,
  CancelCircleIcon as XCircleIcon,
} from "hugeicons-react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from "@/components/ai-elements/sources";
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationDescription,
  ConfirmationActions,
  ConfirmationAction,
} from "@/components/ai-elements/confirmation";
import { Attachment } from "@/components/ai-elements/attachments";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
} from "@/components/ai-elements/chain-of-thought";
import { Task } from "@/components/ai-elements/task";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

type EveFilePart = Extract<EveMessagePart, { type: "file" }>;

export function AgentMessage({
  canRespond,
  isStreaming,
  message,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
}) {
  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (part.type === "text" ? index : last),
    -1,
  );

  return (
    <Message
      data-optimistic={message.metadata?.optimistic ? "true" : undefined}
      from={message.role}
    >
      <MessageContent>
        {message.parts.map((part, index) => (
          <AgentMessagePart
            canRespond={canRespond}
            key={partKey(part, index)}
            onInputResponses={onInputResponses}
            part={part}
            showCaret={isStreaming && message.role === "assistant" && index === lastTextIndex}
          />
        ))}
      </MessageContent>
    </Message>
  );
}

function AgentMessagePart({
  canRespond,
  onInputResponses,
  part,
  showCaret,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveMessagePart;
  readonly showCaret: boolean;
}) {
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      return (
        <MessageResponse caret="block" isAnimating={showCaret}>
          {part.text}
        </MessageResponse>
      );
    case "reasoning":
      return (
        <Reasoning defaultOpen isStreaming={part.state === "streaming"}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    case "file":
      return <AttachmentPart part={part} />;
    case "authorization":
      return <AuthorizationPrompt part={part} />;
    case "dynamic-tool": {
      const isSearch = part.toolName === "web_search" || part.toolName === "search";
      const searchResults =
        isSearch &&
        part.output &&
        typeof part.output === "object" &&
        "results" in part.output &&
        Array.isArray((part.output as any).results)
          ? (part.output as any).results
          : null;

      return (
        <div className="flex flex-col gap-2">
          {searchResults && searchResults.length > 0 ? (
            <ChainOfThought defaultOpen={false}>
              <ChainOfThoughtHeader>
                Search Sources ({searchResults.length})
              </ChainOfThoughtHeader>
              <ChainOfThoughtContent>
                <ChainOfThoughtSearchResults>
                  {searchResults.map((r: { url: string; title?: string }, idx: number) => (
                    <ChainOfThoughtSearchResult key={r.url || idx}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline flex items-center gap-1 max-w-[280px] truncate"
                      >
                        {r.title || r.url}
                      </a>
                    </ChainOfThoughtSearchResult>
                  ))}
                </ChainOfThoughtSearchResults>
              </ChainOfThoughtContent>
            </ChainOfThought>
          ) : null}
          <Tool
            defaultOpen={part.state === "approval-requested" || part.state === "approval-responded"}
          >
            <ToolHeader
              state={part.state}
              title={part.toolName}
              toolName={part.toolName}
              type="dynamic-tool"
            />
            <ToolContent>
              <ToolInput input={part.input} />
              <InputRequestActions
                canRespond={canRespond}
                part={part}
                onInputResponses={onInputResponses}
              />
              <ToolOutput errorText={part.errorText} output={part.output} />
            </ToolContent>
          </Tool>
        </div>
      );
    }
    case "source-url" as any: {
      const sourceUrl = (part as any).url;
      const sourceTitle = (part as any).title ?? sourceUrl;
      return (
        <Sources defaultOpen={true}>
          <SourcesTrigger count={1} />
          <SourcesContent>
            <Source href={sourceUrl} title={sourceTitle}>
              {sourceTitle}
            </Source>
          </SourcesContent>
        </Sources>
      );
    }
  }
}

function AttachmentPart({ part }: { readonly part: EveFilePart }) {
  const item = {
    name: part.filename ?? "Attachment",
    size: part.size,
    type: part.mediaType,
    url: part.url,
    status: "ready" as const,
  };

  return (
    <div className="my-1.5">
      {part.url ? (
        <a href={part.url} rel="noreferrer" target="_blank" className="block max-w-xs">
          <Attachment attachment={item} canRemove={false} />
        </a>
      ) : (
        <Attachment attachment={item} canRemove={false} />
      )}
    </div>
  );
}

function AuthorizationPrompt({ part }: { readonly part: EveAuthorizationPart }) {
  const isAuthorized = part.state === "completed" && part.outcome === "authorized";
  const isCompleted = part.state === "completed";
  const Icon = isAuthorized ? CheckCircleIcon : isCompleted ? XCircleIcon : KeyRoundIcon;
  const instructions = part.authorization?.instructions;
  const shouldShowInstructions = instructions !== undefined && instructions !== part.description;

  return (
    <div
      className={cn(
        "space-y-3 rounded-md border p-3",
        isAuthorized
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isCompleted
            ? "border-destructive/30 bg-destructive/5"
            : "border-blue-500/30 bg-blue-500/5",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            isAuthorized
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : isCompleted
                ? "bg-destructive/10 text-destructive"
                : "bg-blue-500/10 text-blue-700 dark:text-blue-300",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium text-sm">{authorizationTitle(part)}</p>
          <p className="text-muted-foreground text-sm">{authorizationDescription(part)}</p>
          {shouldShowInstructions ? (
            <p className="text-muted-foreground text-sm">{instructions}</p>
          ) : null}
          {part.state === "required" && part.authorization?.userCode ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Code</span>
              <code className="rounded-md bg-background px-2 py-1 font-mono">
                {part.authorization.userCode}
              </code>
            </div>
          ) : null}
          {part.state === "required" && part.authorization?.url ? (
            <Button asChild size="sm">
              <a href={part.authorization.url} rel="noreferrer" target="_blank">
                <ExternalLinkIcon className="size-4" />
                Sign in with {part.displayName}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function authorizationTitle(part: EveAuthorizationPart): string {
  if (part.state === "required") {
    return `Connect ${part.displayName}`;
  }
  if (part.outcome === "authorized") {
    return `${part.displayName} connected`;
  }
  return `${part.displayName} authorization ${formatAuthorizationOutcome(part.outcome)}`;
}

function authorizationDescription(part: EveAuthorizationPart): string {
  if (part.state === "required") {
    return part.description;
  }
  if (part.outcome === "authorized") {
    return `${part.displayName} connected.`;
  }
  const tail = part.reason !== undefined ? ` (${part.reason})` : "";
  return `${part.displayName} authorization ${formatAuthorizationOutcome(part.outcome)}${tail}.`;
}

function formatAuthorizationOutcome(outcome: NonNullable<EveAuthorizationPart["outcome"]>): string {
  switch (outcome) {
    case "authorized":
      return "authorized";
    case "declined":
      return "declined";
    case "failed":
      return "failed";
    case "timed-out":
      return "timed out";
  }
}

function formatBytes(size: number | undefined): string | undefined {
  if (size === undefined) {
    return undefined;
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function InputRequestActions({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  if (!inputRequest) {
    return null;
  }

  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId,
  );

  const isApproved = selectedOption?.style !== "danger" && Boolean(inputResponse);
  const isRejected = selectedOption?.style === "danger" && Boolean(inputResponse);
  const status = isApproved ? "approved" : isRejected ? "rejected" : "pending";
  const hasDanger = inputRequest.options?.some((o) => o.style === "danger");
  const severity = hasDanger ? "warning" : "info";

  return (
    <Confirmation severity={severity} status={status}>
      <ConfirmationTitle severity={severity} status={status}>
        {status === "approved"
          ? "Action Approved"
          : status === "rejected"
          ? "Action Rejected"
          : "Approval Required"}
      </ConfirmationTitle>
      <ConfirmationDescription>{inputRequest.prompt}</ConfirmationDescription>
      {inputResponse ? (
        <div className="ml-8 text-[11px] font-medium text-foreground">
          Selected: {selectedOption?.label ?? inputResponse.text ?? inputResponse.optionId}
        </div>
      ) : (
        <ConfirmationActions>
          {inputRequest.options?.map((option) => (
            <ConfirmationAction
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                void onInputResponses([
                  {
                    optionId: option.id,
                    requestId: inputRequest.requestId,
                  },
                ]);
              }}
              variant={option.style === "danger" ? "destructive" : "default"}
            >
              {option.label}
            </ConfirmationAction>
          ))}
        </ConfirmationActions>
      )}
    </Confirmation>
  );
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "authorization":
      return `authorization:${part.turnId}:${part.stepIndex}:${part.name}`;
    case "dynamic-tool":
      return part.toolCallId;
    default:
      return `${part.type}:${index}`;
  }
}
