"use client";

import * as React from "react";
import {
  PackageIcon,
  Copy01Icon as CopyIcon,
  Tick02Icon as CheckIcon,
  LinkSquare01Icon as ExternalLinkIcon,
  Download01Icon as DownloadIcon,
} from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PackageInfoProps = React.HTMLAttributes<HTMLDivElement> & {
  name: string;
  version?: string;
  description?: string;
  license?: string;
  downloads?: number;
  homepage?: string;
  repository?: string;
  packageManager?: "npm" | "pnpm" | "bun" | "yarn";
};

export function PackageInfo({
  name,
  version,
  description,
  license,
  downloads,
  homepage,
  repository,
  packageManager = "npm",
  className,
  ...props
}: PackageInfoProps) {
  const [copied, setCopied] = React.useState(false);

  const installCommand =
    packageManager === "pnpm"
      ? `pnpm add ${name}`
      : packageManager === "bun"
      ? `bun add ${name}`
      : packageManager === "yarn"
      ? `yarn add ${name}`
      : `npm install ${name}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "my-3 flex flex-col gap-2.5 rounded-xl border border-border/50 bg-background/70 p-3.5 text-xs shadow-xs",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PackageIcon className="size-4" />
          </span>
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-foreground text-sm truncate">{name}</span>
            {version ? (
              <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                v{version}
              </span>
            ) : null}
            {license ? (
              <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                {license}
              </span>
            ) : null}
          </div>
        </div>

        {repository || homepage ? (
          <a
            href={repository || homepage}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Open repository"
          >
            <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : null}
      </div>

      {description ? (
        <p className="text-muted-foreground text-[11px] leading-relaxed line-clamp-2">
          {description}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5 font-mono text-[11px]">
        <span className="truncate text-foreground/80">{installCommand}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
          title="Copy command"
        >
          {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
        </Button>
      </div>

      {typeof downloads === "number" ? (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <DownloadIcon className="size-3" />
          <span>{downloads.toLocaleString()} weekly downloads</span>
        </div>
      ) : null}
    </div>
  );
}
