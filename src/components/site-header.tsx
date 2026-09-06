"use client";

import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NotificationBell } from "@/components/notification-bell"
import { ThemeToggle } from "@/components/theme-toggle"
import { HelpTutorialDialog } from "@/components/help-tutorial-dialog"
import { CollaborativeAvatars } from "@/components/collaboration/collaborative-avatars"
import { useLiveblocksConfig } from "@/components/collaboration/liveblocks-provider"

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/compose": "Compose",
  "/drafts": "Drafts",
  "/calendar": "Calendar",
  "/engagement": "Engagement",
  "/theme-studio": "Theme Studio",
  "/flows": "Flows",
  "/assets": "Assets",
  "/brandkit": "Brand Kit",
  "/analytics": "Analytics",
  "/settings": "Settings",
  "/operations": "Operations",
  "/accounts": "Accounts",
  "/notifications": "Notifications",
};

export function SiteHeader({ unreadNotificationCount = 0 }: { unreadNotificationCount?: number }) {
  const pathname = usePathname();
  const { isConfigured, tenantId } = useLiveblocksConfig();
  const activeLabel =
    (pathname && ROUTE_LABELS[pathname]) ||
    (pathname?.startsWith("/flows/")
      ? "Flow Builder"
      : pathname?.startsWith("/theme-studio/")
        ? "Theme Studio"
        : "Overview");

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-xl transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) sticky top-0 z-40">
      <div className="flex w-full items-center gap-2 px-4 lg:gap-3 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-1 data-[orientation=vertical]:h-4 bg-border"
        />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Joey</span>
          <span>/</span>
          <span className="font-semibold text-foreground">{activeLabel}</span>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {isConfigured && tenantId && (
            <div className="flex items-center gap-2 border-r border-border pr-2 sm:pr-3">
              <CollaborativeAvatars roomId={`workspace:${tenantId}:presence`} maxAvatars={3} />
            </div>
          )}
          <HelpTutorialDialog />
          <NotificationBell initialUnreadCount={unreadNotificationCount} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
