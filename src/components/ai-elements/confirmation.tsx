"use client";

import * as React from "react";
import {
  Alert02Icon as AlertIcon,
  CheckmarkCircle02Icon as CheckCircleIcon,
  CancelCircleIcon as XCircleIcon,
  HelpCircleIcon as QuestionIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmationSeverity = "info" | "warning" | "destructive";

export type ConfirmationProps = React.HTMLAttributes<HTMLDivElement> & {
  severity?: ConfirmationSeverity;
  status?: "pending" | "approved" | "rejected";
};

export const Confirmation = React.forwardRef<HTMLDivElement, ConfirmationProps>(
  ({ className, severity = "warning", status = "pending", children, ...props }, ref) => {
    const isApproved = status === "approved";
    const isRejected = status === "rejected";

    return (
      <div
        ref={ref}
        className={cn(
          "my-3 flex flex-col gap-2.5 rounded-xl border p-4 text-xs transition-all shadow-xs",
          isApproved
            ? "border-emerald-500/30 bg-emerald-500/5 text-foreground"
            : isRejected
            ? "border-destructive/30 bg-destructive/5 text-foreground"
            : severity === "destructive"
            ? "border-destructive/40 bg-destructive/5"
            : severity === "warning"
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-blue-500/30 bg-blue-500/5",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Confirmation.displayName = "Confirmation";

export function ConfirmationTitle({
  children,
  severity = "warning",
  status = "pending",
  className,
}: {
  children: React.ReactNode;
  severity?: ConfirmationSeverity;
  status?: "pending" | "approved" | "rejected";
  className?: string;
}) {
  const Icon =
    status === "approved"
      ? CheckCircleIcon
      : status === "rejected"
      ? XCircleIcon
      : severity === "destructive" || severity === "warning"
      ? AlertIcon
      : QuestionIcon;

  const iconTone =
    status === "approved"
      ? "text-emerald-500 bg-emerald-500/15"
      : status === "rejected"
      ? "text-destructive bg-destructive/15"
      : severity === "destructive"
      ? "text-destructive bg-destructive/15"
      : severity === "warning"
      ? "text-amber-500 bg-amber-500/15"
      : "text-blue-500 bg-blue-500/15";

  return (
    <div className={cn("flex items-center gap-2 font-medium text-sm text-foreground", className)}>
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", iconTone)}>
        <Icon className="size-3.5" />
      </span>
      <span>{children}</span>
    </div>
  );
}

export function ConfirmationDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-xs text-muted-foreground leading-relaxed pl-8", className)}>
      {children}
    </p>
  );
}

export function ConfirmationContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ml-8 rounded-lg border border-border/40 bg-background/70 p-3 text-xs font-mono text-muted-foreground overflow-x-auto",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ConfirmationActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ml-8 mt-1 flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

export function ConfirmationAction({
  children,
  variant = "default",
  shortcut,
  className,
  ...props
}: React.ComponentProps<typeof Button> & {
  shortcut?: string;
}) {
  return (
    <Button
      size="sm"
      variant={variant}
      className={cn("h-7 px-3 text-xs gap-1.5 cursor-pointer font-medium", className)}
      {...props}
    >
      <span>{children}</span>
      {shortcut ? (
        <kbd className="hidden sm:inline-block rounded bg-background/20 px-1 text-[10px] font-mono text-inherit">
          {shortcut}
        </kbd>
      ) : null}
    </Button>
  );
}
