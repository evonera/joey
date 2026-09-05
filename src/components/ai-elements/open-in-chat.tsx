"use client";

import * as React from "react";
import { Message01Icon as ChatIcon, ArrowRight01Icon as ArrowIcon } from "hugeicons-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export type OpenInChatProps = Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  prompt: string;
  label?: string;
  autoSend?: boolean;
};

export function OpenInChatButton({
  prompt,
  label = "Ask Joey",
  autoSend = true,
  className,
  variant = "outline",
  size = "sm",
  ...props
}: OpenInChatProps) {
  const router = useRouter();

  const handleClick = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "joey_seed_prompt",
        JSON.stringify({ prompt, autoSend })
      );
      router.push("/");
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      className={cn(
        "h-7 px-2.5 text-xs gap-1.5 cursor-pointer shadow-none text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      <ChatIcon className="size-3.5 text-primary" />
      <span>{label}</span>
      <ArrowIcon className="size-3 opacity-60" />
    </Button>
  );
}
