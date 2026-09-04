"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SuggestionsProps = React.HTMLAttributes<HTMLDivElement>;

export const Suggestions = React.forwardRef<HTMLDivElement, SuggestionsProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex w-full items-center gap-2 overflow-x-auto py-1 scrollbar-none",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Suggestions.displayName = "Suggestions";

export type SuggestionProps = Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
  icon?: React.ReactNode;
};

export const Suggestion = React.forwardRef<HTMLButtonElement, SuggestionProps>(
  (
    {
      suggestion,
      onClick,
      icon,
      children,
      className,
      variant = "outline",
      size = "sm",
      ...props
    },
    ref,
  ) => {
    return (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        size={size}
        className={cn(
          "h-auto shrink-0 rounded-full px-3 py-1.5 text-xs font-normal border-border/60 bg-background/50 hover:bg-muted/80 text-foreground/80 hover:text-foreground transition-all gap-1.5 cursor-pointer shadow-none",
          className,
        )}
        onClick={() => onClick?.(suggestion)}
        {...props}
      >
        {icon}
        {children ?? suggestion}
      </Button>
    );
  },
);
Suggestion.displayName = "Suggestion";
