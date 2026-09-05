"use client";

import * as React from "react";
import {
  File02Icon as FileIcon,
  Copy01Icon as CopyIcon,
  Tick02Icon as CheckIcon,
  Download01Icon as DownloadIcon,
  MaximizeScreenIcon as FullscreenIcon,
  CodeIcon,
  ViewIcon as PreviewIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ArtifactType = "code" | "document" | "preview" | "svg" | "markdown";

export type ArtifactProps = React.HTMLAttributes<HTMLDivElement> & {
  title: string;
  type?: ArtifactType;
  language?: string;
  code?: string;
  preview?: React.ReactNode;
  defaultTab?: "preview" | "code";
  onDownload?: () => void;
};

export function Artifact({
  title,
  type = "code",
  language,
  code,
  preview,
  defaultTab = preview ? "preview" : "code",
  onDownload,
  className,
  children,
  ...props
}: ArtifactProps) {
  const [activeTab, setActiveTab] = React.useState<"preview" | "code">(defaultTab);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "my-3 flex flex-col rounded-xl border border-border/60 bg-background/80 overflow-hidden text-xs shadow-xs",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon className="size-3.5 text-primary shrink-0" />
          <span className="font-semibold text-foreground truncate">{title}</span>
          {language ? (
            <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground uppercase">
              {language}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {preview && code ? (
            <div className="flex items-center rounded-md border border-border/40 bg-background/50 p-0.5 mr-1">
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                  activeTab === "preview"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <PreviewIcon className="size-3" />
                <span>Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("code")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                  activeTab === "code"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CodeIcon className="size-3" />
                <span>Code</span>
              </button>
            </div>
          ) : null}

          {code ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Copy code"
            >
              {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
            </Button>
          ) : null}

          {onDownload ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDownload}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Download artifact"
            >
              <DownloadIcon className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-[120px] max-h-[480px] overflow-auto">
        {children ?? (
          activeTab === "preview" && preview ? (
            <div className="p-4 flex items-center justify-center bg-muted/10">
              {preview}
            </div>
          ) : code ? (
            <pre className="p-3 font-mono text-[11px] leading-relaxed text-foreground bg-muted/20 whitespace-pre overflow-x-auto">
              <code>{code}</code>
            </pre>
          ) : null
        )}
      </div>
    </div>
  );
}
