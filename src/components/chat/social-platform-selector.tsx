"use client";

import * as React from "react";
import {
  IconBrandBluesky,
  IconBrandDiscord,
  IconBrandFacebook,
  IconBrandGoogle,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandPinterest,
  IconBrandReddit,
  IconBrandSnapchat,
  IconBrandTelegram,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandWhatsapp,
  IconBrandYoutube,
} from "@tabler/icons-react";
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
  { id: "tiktok", name: "TikTok", canonicalKey: "tiktok", aliases: ["tiktok"], icon: IconBrandTiktok },
  { id: "youtube", name: "YouTube", canonicalKey: "youtube", aliases: ["youtube"], icon: IconBrandYoutube },
  { id: "threads", name: "Threads", canonicalKey: "threads", aliases: ["threads"], icon: IconBrandThreads },
  {
    id: "x",
    name: "X (Twitter)",
    canonicalKey: "twitter",
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
    icon: IconBrandInstagram,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    canonicalKey: "linkedin",
    aliases: ["linkedin"],
    icon: IconBrandLinkedin,
  },
  {
    id: "facebook",
    name: "Facebook",
    canonicalKey: "facebook",
    aliases: ["facebook"],
    icon: IconBrandFacebook,
  },
  {
    id: "pinterest",
    name: "Pinterest",
    canonicalKey: "pinterest",
    aliases: ["pinterest"],
    icon: IconBrandPinterest,
  },
  {
    id: "bluesky",
    name: "Bluesky",
    canonicalKey: "bluesky",
    aliases: ["bluesky"],
    icon: IconBrandBluesky,
  },
  { id: "reddit", name: "Reddit", canonicalKey: "reddit", aliases: ["reddit"], icon: IconBrandReddit },
  { id: "googlebusiness", name: "Google Business", canonicalKey: "googlebusiness", aliases: ["googlebusiness", "google_business"], icon: IconBrandGoogle },
  { id: "telegram", name: "Telegram", canonicalKey: "telegram", aliases: ["telegram"], icon: IconBrandTelegram },
  { id: "snapchat", name: "Snapchat", canonicalKey: "snapchat", aliases: ["snapchat"], icon: IconBrandSnapchat },
  { id: "whatsapp", name: "WhatsApp", canonicalKey: "whatsapp", aliases: ["whatsapp"], icon: IconBrandWhatsapp },
  { id: "discord", name: "Discord", canonicalKey: "discord", aliases: ["discord"], icon: IconBrandDiscord },
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
    <div className={cn("flex items-center gap-1.5 flex-wrap pt-1 text-xs select-none", className)} data-tour="chat-accounts">
      {/* Account / Channel Dropdown Trigger */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors cursor-pointer",
              totalSelectedCount > 0
                ? "border-[#ffe633]/60 bg-[#ffe633]/15 text-foreground hover:bg-[#ffe633]/25"
                : "border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            )}
            title="Choose specific social media accounts or theme pages to target"
          >
            <ChannelIcon className="size-3 text-[#ffe633]" />
            <span>
              {totalSelectedCount > 0 ? `Accounts ${totalSelectedCount}` : "Accounts"}
            </span>
            <ArrowDown01Icon className="size-2.5 opacity-60 ml-0.5" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-72 p-1.5 text-xs max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between px-2 py-1">
            <DropdownMenuLabel className="p-0 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              Accounts and formats
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
