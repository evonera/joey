"use client";

import * as React from "react";
import {
  ViewIcon as EyeIcon,
  ViewOffIcon as EyeOffIcon,
  Copy01Icon as CopyIcon,
  Tick02Icon as CheckIcon,
  LockKeyIcon as LockIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EnvVar = {
  key: string;
  value: string;
  isSecret?: boolean;
  description?: string;
};

export type EnvironmentVariablesProps = React.HTMLAttributes<HTMLDivElement> & {
  variables: EnvVar[];
  title?: string;
};

export function EnvironmentVariables({
  variables,
  title = "Environment Variables",
  className,
  ...props
}: EnvironmentVariablesProps) {
  return (
    <div
      className={cn(
        "my-3 flex flex-col rounded-xl border border-border/50 bg-background/70 p-3 text-xs shadow-xs space-y-2",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5 font-semibold text-foreground pb-1 border-b border-border/30">
        <LockIcon className="size-3.5 text-primary" />
        <span>{title}</span>
      </div>

      <div className="flex flex-col divide-y divide-border/30">
        {variables.map((v) => (
          <EnvVarRow key={v.key} variable={v} />
        ))}
      </div>
    </div>
  );
}

export function EnvVarRow({ variable }: { variable: EnvVar }) {
  const [revealed, setRevealed] = React.useState(!variable.isSecret);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(variable.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex flex-col min-w-0">
        <span className="font-mono font-medium text-foreground text-xs truncate">
          {variable.key}
        </span>
        {variable.description ? (
          <span className="text-[10px] text-muted-foreground truncate">
            {variable.description}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="font-mono text-xs text-muted-foreground bg-muted/40 rounded px-2 py-0.5 max-w-[180px] truncate select-all">
          {revealed ? variable.value : "••••••••••••••••"}
        </span>

        {variable.isSecret ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRevealed(!revealed)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
            title={revealed ? "Hide value" : "Reveal value"}
          >
            {revealed ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Copy value"
        >
          {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
        </Button>
      </div>
    </div>
  );
}
