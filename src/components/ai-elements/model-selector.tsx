"use client";

import * as React from "react";
import {
  SparklesIcon,
  Search01Icon as SearchIcon,
  ArrowDown01Icon as ChevronDownIcon,
  Tick02Icon as CheckIcon,
  LockKeyIcon as LockIcon,
} from "hugeicons-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ModelOption = {
  id: string;
  name: string;
  provider: string;
  description?: string;
  badge?: string;
  contextWindow?: string;
  hasKey?: boolean;
  isRecommended?: boolean;
};

export type ModelSelectorProps = {
  models: ModelOption[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  className?: string;
};

export function ModelSelector({
  models,
  selectedModelId,
  onSelectModel,
  className,
}: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const current = models.find((m) => m.id === selectedModelId) || models[0];

  const filtered = models.filter((m) => {
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q))
    );
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors cursor-pointer select-none",
            className
          )}
        >
          <SparklesIcon className="size-3.5 text-amber-500" />
          <span className="truncate max-w-[120px]">{current?.name ?? "Select model"}</span>
          <ChevronDownIcon className="size-3 text-muted-foreground opacity-60 ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 p-2 shadow-xl border border-border/60 bg-popover/95 backdrop-blur-md rounded-xl space-y-2"
      >
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models…"
            className="w-full rounded-md border border-border/50 bg-background/50 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No models found
            </div>
          ) : (
            filtered.map((m) => {
              const isSelected = m.id === selectedModelId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onSelectModel(m.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg p-2 text-left text-xs transition-colors hover:bg-muted/70 cursor-pointer select-none",
                    isSelected && "bg-muted/90"
                  )}
                >
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground truncate">{m.name}</span>
                      {m.badge ? (
                        <span className="rounded bg-primary/10 px-1 py-0.2 text-[10px] font-medium text-primary">
                          {m.badge}
                        </span>
                      ) : null}
                      {m.hasKey ? (
                        <span className="ml-auto size-1.5 rounded-full bg-emerald-500" title="Active key" />
                      ) : (
                        <span className="ml-auto" title="Key required">
                          <LockIcon className="size-3 text-muted-foreground/60" />
                        </span>
                      )}
                    </div>
                    {m.description ? (
                      <span className="text-[11px] text-muted-foreground line-clamp-1">
                        {m.description}
                      </span>
                    ) : null}
                  </div>
                  {isSelected ? (
                    <CheckIcon className="size-4 text-primary shrink-0 mt-0.5" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
