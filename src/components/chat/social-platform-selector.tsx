"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { getConnectedAccounts } from "@/app/actions/zernio";
import { getThemePages } from "@/app/actions/theme-pages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDown01Icon,
  Cancel01Icon as XIcon,
  Globe02Icon as ChannelIcon,
  Layers01Icon as ThemeIcon,
} from "hugeicons-react";

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
  const [accountThemeMap, setAccountThemeMap] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [accRes, themesRes] = await Promise.all([
          getConnectedAccounts(),
          getThemePages().catch(() => ({ pages: [] })),
        ]);

        if (!mounted) return;

        if (accRes && "accounts" in accRes && Array.isArray(accRes.accounts)) {
          setAccounts(accRes.accounts as ConnectedAccount[]);
        }

        // Build accountId -> themePageName map
        const map: Record<string, string> = {};
        if (themesRes && "pages" in themesRes && Array.isArray(themesRes.pages)) {
          for (const page of themesRes.pages) {
            const rawConnected = (page as any).connectedAccounts;
            const connectedArr = Array.isArray(rawConnected) ? rawConnected : [];
            for (const accId of connectedArr) {
              if (typeof accId === "string") {
                map[accId] = page.name;
              }
            }
          }
        }
        setAccountThemeMap(map);
      } catch (err) {
        console.warn("Could not load connected accounts or themes:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadData();
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

  // Compute total selected items count
  const totalSelectedCount = React.useMemo(() => {
    let count = 0;
    for (const p of selectedPlatforms) {
      const accs = selectedAccountIds[p];
      if (accs && accs.length > 0) {
        count += accs.length;
      } else {
        count += 1;
      }
    }
    return count;
  }, [selectedPlatforms, selectedAccountIds]);

  // Handle removing a specific account or platform
  const handleRemoveAccount = (platformId: string, accountId?: string) => {
    if (!accountId) {
      onTogglePlatform(platformId);
      return;
    }
    const current = selectedAccountIds[platformId] || [];
    const next = current.filter((id) => id !== accountId);
    if (next.length === 0) {
      onTogglePlatform(platformId);
    } else {
      onSelectAccounts(platformId, next);
    }
  };

  // Clear all selections
  const handleClearAll = () => {
    for (const p of selectedPlatforms) {
      onTogglePlatform(p);
    }
  };

  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap pt-1 text-xs select-none", className)}>
      {/* Account / Channel Dropdown Trigger */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-[11px] font-medium transition-colors cursor-pointer",
              totalSelectedCount > 0
                ? "border-[#ffe633]/60 bg-[#ffe633]/15 text-foreground hover:bg-[#ffe633]/25"
                : "border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            )}
            title="Choose specific social media accounts or theme pages to target"
          >
            <ChannelIcon className="size-3 text-[#ffe633]" />
            <span>
              {totalSelectedCount > 0 ? `Target Channels (${totalSelectedCount})` : "Target Channels"}
            </span>
            <ArrowDown01Icon className="size-2.5 opacity-60 ml-0.5" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-72 p-1.5 text-xs max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between px-2 py-1">
            <DropdownMenuLabel className="p-0 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              Publishing Accounts
            </DropdownMenuLabel>
            {totalSelectedCount > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>
          <DropdownMenuSeparator />

          {PLATFORMS.map((platform) => {
            const isPlatformSelected = selectedPlatforms.includes(platform.id);
            const matchingAccounts = getAccountsForPlatform(platform);
            const activeAccountIds = selectedAccountIds[platform.id] !== undefined
              ? selectedAccountIds[platform.id]!
              : (isPlatformSelected ? matchingAccounts.map((a) => a.id) : []);

            const Icon = platform.icon;

            return (
              <div key={platform.id} className="py-1">
                <div className="px-2 py-0.5 text-[10px] font-semibold text-muted-foreground/80 flex items-center gap-1.5">
                  <Icon className="size-3" />
                  <span>{platform.name}</span>
                </div>

                {matchingAccounts.length === 0 ? (
                  /* No connected accounts yet — allow targeting format */
                  <DropdownMenuCheckboxItem
                    checked={isPlatformSelected}
                    onCheckedChange={() => onTogglePlatform(platform.id)}
                    className="text-xs cursor-pointer ml-1 py-1"
                  >
                    <span className="text-muted-foreground text-[11px]">
                      Target {platform.name} format
                    </span>
                  </DropdownMenuCheckboxItem>
                ) : (
                  /* Show each connected account with its handle and theme page */
                  matchingAccounts.map((acc) => {
                    const isChecked = activeAccountIds.includes(acc.id);
                    const themeName = accountThemeMap[acc.id];

                    return (
                      <DropdownMenuCheckboxItem
                        key={acc.id}
                        checked={isChecked}
                        onCheckedChange={(shouldCheck) => {
                          const next = shouldCheck
                            ? [...activeAccountIds, acc.id]
                            : activeAccountIds.filter((id) => id !== acc.id);

                          if (next.length > 0 && !isPlatformSelected) {
                            onTogglePlatform(platform.id);
                          } else if (next.length === 0 && isPlatformSelected) {
                            onTogglePlatform(platform.id);
                          }
                          onSelectAccounts(platform.id, next);
                        }}
                        className="text-xs cursor-pointer ml-1 py-1.5 flex flex-col items-start gap-0.5"
                      >
                        <div className="flex items-center gap-1.5 w-full">
                          <span className="font-medium text-foreground truncate">
                            {acc.accountName || "Connected Account"}
                          </span>
                        </div>
                        {themeName && (
                          <div className="flex items-center gap-1 text-[10px] text-[#ffe633]/80">
                            <ThemeIcon className="size-2.5" />
                            <span className="truncate">Theme: {themeName}</span>
                          </div>
                        )}
                      </DropdownMenuCheckboxItem>
                    );
                  })
                )}
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Selected Account Removable Chips */}
      {selectedPlatforms.map((platformId) => {
        const platform = PLATFORMS.find((p) => p.id === platformId);
        if (!platform) return null;
        const Icon = platform.icon;
        const matchingAccounts = getAccountsForPlatform(platform);
        const activeAccountIds = selectedAccountIds[platformId] !== undefined
          ? selectedAccountIds[platformId]!
          : matchingAccounts.map((a) => a.id);

        if (activeAccountIds.length === 0 || matchingAccounts.length === 0) {
          return (
            <span
              key={platformId}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.1] text-[11px] text-foreground"
            >
              <Icon className="size-3 text-[#ffe633]" />
              <span>{platform.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveAccount(platformId)}
                className="text-muted-foreground hover:text-foreground cursor-pointer ml-0.5"
                title="Remove channel"
              >
                <XIcon className="size-2.5" />
              </button>
            </span>
          );
        }

        return activeAccountIds.map((accId) => {
          const acc = matchingAccounts.find((a) => a.id === accId);
          const themeName = accountThemeMap[accId];

          return (
            <span
              key={accId}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ffe633]/10 border border-[#ffe633]/25 text-[11px] text-foreground"
            >
              <Icon className="size-3 text-[#ffe633]" />
              <span className="font-medium truncate max-w-[130px]">
                {acc?.accountName || platform.name}
              </span>
              {themeName && (
                <span className="text-[10px] text-[#ffe633]/80 truncate max-w-[90px]">
                  ({themeName})
                </span>
              )}
              <button
                type="button"
                onClick={() => handleRemoveAccount(platformId, accId)}
                className="text-muted-foreground hover:text-foreground cursor-pointer ml-0.5"
                title="Remove account"
              >
                <XIcon className="size-2.5" />
              </button>
            </span>
          );
        });
      })}
    </div>
  );
}
