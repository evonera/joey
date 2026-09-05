"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { getConnectedAccounts } from "@/app/actions/zernio";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDown01Icon, CheckmarkCircle02Icon as CheckIcon } from "hugeicons-react";

export interface ConnectedAccount {
  id: string;
  platform: string;
  accountName: string | null;
  avatarUrl: string | null;
  isActive: boolean | null;
}

export interface PlatformConfig {
  id: string;
  name: string;
  canonicalKey: string;
  aliases: string[];
  icon: (props: { className?: string }) => React.ReactNode;
}

export const PLATFORMS: PlatformConfig[] = [
  {
    id: "x",
    name: "X (Twitter)",
    canonicalKey: "x",
    aliases: ["x", "twitter"],
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: "instagram",
    name: "Instagram",
    canonicalKey: "instagram",
    aliases: ["instagram"],
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    ),
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    canonicalKey: "linkedin",
    aliases: ["linkedin"],
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.55a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28z" />
      </svg>
    ),
  },
  {
    id: "facebook",
    name: "Facebook",
    canonicalKey: "facebook",
    aliases: ["facebook"],
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z" />
      </svg>
    ),
  },
  {
    id: "pinterest",
    name: "Pinterest",
    canonicalKey: "pinterest",
    aliases: ["pinterest"],
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0a12 12 0 0 0-4.37 23.18c-.06-.98-.12-2.48.02-3.55l1.04-4.4s-.26-.53-.26-1.31c0-1.23.71-2.15 1.6-2.15.75 0 1.12.57 1.12 1.25 0 .76-.48 1.9-1.02 2.95-.21.9.45 1.63 1.34 1.63 1.61 0 2.85-1.7 2.85-4.15 0-2.17-1.56-3.69-3.79-3.69-2.58 0-4.1 1.94-4.1 3.94 0 .78.3 1.62.68 2.07a.34.34 0 0 1 .08.33l-.26 1.04c-.04.16-.14.2-.32.12-1.2-.56-1.95-2.31-1.95-3.72 0-3.03 2.2-5.81 6.35-5.81 3.34 0 5.93 2.38 5.93 5.56 0 3.32-2.09 5.98-5 5.98-.98 0-1.9-.51-2.21-1.11l-.6 2.3c-.22.84-.81 1.9-1.21 2.54A12 12 0 1 0 12 0z" />
      </svg>
    ),
  },
  {
    id: "bluesky",
    name: "Bluesky",
    canonicalKey: "bluesky",
    aliases: ["bluesky"],
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566 1.154 1.076 2.054 1.076 4.354c0 1.28.32 7.027 1.22 8.784 1.08 2.11 3.2 2.76 5.12 2.45-2.88 1.14-5.3 3.63-3.12 7.37 2.18 3.74 6.01.27 7.7-2.6 1.7 2.87 5.53 6.34 7.7 2.6 2.19-3.74-.23-6.23-3.11-7.37 1.92.31 4.04-.34 5.12-2.45.9-1.757 1.22-7.504 1.22-8.784 0-2.3-1.49-3.2-4.12-1.549-2.752 1.942-5.711 5.881-6.798 7.995z" />
      </svg>
    ),
  },
];

interface SocialPlatformSelectorProps {
  selectedPlatforms: string[];
  onTogglePlatform: (platformId: string) => void;
  selectedAccountIds: Record<string, string[]>;
  onSelectAccounts: (platformId: string, accountIds: string[]) => void;
  className?: string;
}

export function SocialPlatformSelector({
  selectedPlatforms,
  onTogglePlatform,
  selectedAccountIds,
  onSelectAccounts,
  className,
}: SocialPlatformSelectorProps) {
  const [accounts, setAccounts] = React.useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    async function loadAccounts() {
      try {
        const res = await getConnectedAccounts();
        if (mounted && res && "accounts" in res && Array.isArray(res.accounts)) {
          setAccounts(res.accounts as ConnectedAccount[]);
        }
      } catch (err) {
        console.warn("Could not load connected accounts:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadAccounts();
    return () => {
      mounted = false;
    };
  }, []);

  const getAccountsForPlatform = React.useCallback(
    (platform: PlatformConfig) => {
      return accounts.filter((acc) => {
        const p = acc.platform?.toLowerCase() || "";
        return platform.aliases.includes(p) && acc.isActive !== false;
      });
    },
    [accounts]
  );

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 flex-wrap pt-1.5 text-xs select-none",
        className
      )}
    >
      <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/60 mr-1 hidden sm:inline">
        Target:
      </span>

      {PLATFORMS.map((platform) => {
        const isSelected = selectedPlatforms.includes(platform.id);
        const matchingAccounts = getAccountsForPlatform(platform);
        const hasAccounts = matchingAccounts.length > 0;
        const isExplicitSelection = selectedAccountIds[platform.id] !== undefined;
        const activeAccountIds = isExplicitSelection
          ? selectedAccountIds[platform.id]!
          : matchingAccounts.map((a) => a.id);

        // Targeted count matches active selection
        const targetedCount = activeAccountIds.length;

        const Icon = platform.icon;

        return (
          <div key={platform.id} className="inline-flex items-center">
            {hasAccounts ? (
              <div
                className={cn(
                  "inline-flex items-center rounded-full border transition-all duration-150 text-xs",
                  isSelected
                    ? "border-[#ffe633]/60 bg-[#ffe633]/15 text-foreground font-medium shadow-xs"
                    : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                )}
              >
                {/* Platform Toggle Button */}
                <button
                  type="button"
                  onClick={() => onTogglePlatform(platform.id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 cursor-pointer"
                  title={`Target ${platform.name} for research & publishing`}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span>{platform.name}</span>
                  {isSelected && (
                    <span className="size-1.5 rounded-full bg-[#ffe633] animate-pulse" />
                  )}
                </button>

                {/* Account Picker Dropdown */}
                {isSelected && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="px-1.5 py-1 border-l border-white/[0.1] hover:bg-white/[0.08] rounded-r-full text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        title="Select connected accounts"
                      >
                        <span>
                          {targetedCount === 1 && matchingAccounts.length === 1
                            ? matchingAccounts[0].accountName || "1 acc"
                            : `${targetedCount} acc`}
                        </span>
                        <ArrowDown01Icon className="size-3 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 p-1 text-xs">
                      <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {platform.name} Accounts
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {matchingAccounts.map((acc) => {
                        const checked = activeAccountIds.includes(acc.id);

                        return (
                          <DropdownMenuCheckboxItem
                            key={acc.id}
                            checked={checked}
                            onCheckedChange={(shouldCheck) => {
                              const next = shouldCheck
                                ? [...activeAccountIds, acc.id]
                                : activeAccountIds.filter((id) => id !== acc.id);
                              onSelectAccounts(platform.id, next);
                            }}
                            className="text-xs cursor-pointer"
                          >
                            <span className="truncate font-medium">
                              {acc.accountName || "Connected Account"}
                            </span>
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ) : (
              /* If no connected accounts, can still toggle platform to tell Joey to draft for it */
              <button
                type="button"
                onClick={() => onTogglePlatform(platform.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-all duration-150 text-xs cursor-pointer",
                  isSelected
                    ? "border-[#ffe633]/60 bg-[#ffe633]/15 text-foreground font-medium shadow-xs"
                    : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                )}
                title={`Target ${platform.name} format`}
              >
                <Icon className="size-3.5 shrink-0" />
                <span>{platform.name}</span>
                {isSelected && (
                  <span className="size-1.5 rounded-full bg-[#ffe633]" />
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
