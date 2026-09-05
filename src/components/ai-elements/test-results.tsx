"use client";

import * as React from "react";
import {
  CheckmarkCircle02Icon as CheckCircleIcon,
  CancelCircleIcon as XCircleIcon,
  HelpCircleIcon as SkipIcon,
  Clock01Icon as ClockIcon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";

export type TestItemData = {
  id: string;
  name: string;
  status: "passed" | "failed" | "skipped";
  durationMs?: number;
  errorMessage?: string;
};

export type TestResultsProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string;
  tests: TestItemData[];
  durationMs?: number;
};

export function TestResults({
  title = "Test Results",
  tests,
  durationMs,
  className,
  ...props
}: TestResultsProps) {
  const passed = tests.filter((t) => t.status === "passed").length;
  const failed = tests.filter((t) => t.status === "failed").length;
  const skipped = tests.filter((t) => t.status === "skipped").length;

  return (
    <div
      className={cn(
        "my-3 flex flex-col rounded-xl border border-border/50 bg-background/70 p-3.5 text-xs shadow-xs space-y-2.5",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between pb-1 border-b border-border/30">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{title}</span>
          {typeof durationMs === "number" ? (
            <span className="text-[11px] text-muted-foreground font-mono">
              ({(durationMs / 1000).toFixed(2)}s)
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          {passed > 0 ? (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-emerald-500 font-medium">
              {passed} passed
            </span>
          ) : null}
          {failed > 0 ? (
            <span className="rounded bg-destructive/10 px-1.5 py-0.2 text-destructive font-medium">
              {failed} failed
            </span>
          ) : null}
          {skipped > 0 ? (
            <span className="rounded bg-muted px-1.5 py-0.2 text-muted-foreground">
              {skipped} skipped
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {tests.map((test) => (
          <div
            key={test.id}
            className="flex flex-col gap-1 rounded-lg border border-border/20 bg-muted/20 px-2.5 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <TestStatusIcon status={test.status} />
                <span className="font-medium text-foreground truncate">{test.name}</span>
              </div>
              {typeof test.durationMs === "number" ? (
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {test.durationMs}ms
                </span>
              ) : null}
            </div>

            {test.errorMessage ? (
              <pre className="mt-1 rounded bg-destructive/10 p-2 font-mono text-[10px] text-destructive overflow-x-auto whitespace-pre-wrap">
                {test.errorMessage}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TestStatusIcon({ status }: { status: "passed" | "failed" | "skipped" }) {
  switch (status) {
    case "passed":
      return <CheckCircleIcon className="size-3.5 text-emerald-500 shrink-0" />;
    case "failed":
      return <XCircleIcon className="size-3.5 text-destructive shrink-0" />;
    case "skipped":
      return <SkipIcon className="size-3.5 text-muted-foreground shrink-0" />;
  }
}
