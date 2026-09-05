"use client";

import * as React from "react";
import {
  CodeIcon,
  ViewIcon as PreviewIcon,
  RefreshIcon,
  Alert02Icon as AlertIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type JSXPreviewProps = React.HTMLAttributes<HTMLDivElement> & {
  code?: string;
  renderComponent?: React.ReactNode;
  title?: string;
};

export function JSXPreview({
  code,
  renderComponent,
  title = "React Component Preview",
  className,
  ...props
}: JSXPreviewProps) {
  const [tab, setTab] = React.useState<"preview" | "code">("preview");
  const [key, setKey] = React.useState(0);

  return (
    <div
      className={cn(
        "my-3 flex flex-col rounded-xl border border-border/50 bg-background/80 overflow-hidden text-xs shadow-xs",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3 py-2">
        <span className="font-semibold text-foreground truncate">{title}</span>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-md border border-border/40 bg-background/50 p-0.5">
            <button
              type="button"
              onClick={() => setTab("preview")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                tab === "preview"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <PreviewIcon className="size-3" />
              <span>Preview</span>
            </button>
            {code ? (
              <button
                type="button"
                onClick={() => setTab("code")}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer",
                  tab === "code"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CodeIcon className="size-3" />
                <span>JSX</span>
              </button>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setKey((prev) => prev + 1)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Reload preview"
          >
            <RefreshIcon className="size-3" />
          </Button>
        </div>
      </div>

      <div className="min-h-[140px] max-h-[400px] overflow-auto">
        {tab === "preview" ? (
          <JSXErrorBoundary key={key}>
            <div className="p-4 flex items-center justify-center">
              {renderComponent}
            </div>
          </JSXErrorBoundary>
        ) : code ? (
          <pre className="p-3 font-mono text-[11px] leading-relaxed text-foreground bg-muted/20 whitespace-pre overflow-x-auto">
            <code>{code}</code>
          </pre>
        ) : null}
      </div>
    </div>
  );
}

class JSXErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center gap-2 text-destructive">
          <AlertIcon className="size-6" />
          <span className="font-semibold text-xs">Preview Render Error</span>
          <span className="text-[11px] text-muted-foreground font-mono max-w-sm truncate">
            {this.state.error?.message}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}
