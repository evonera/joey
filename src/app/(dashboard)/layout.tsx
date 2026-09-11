import { ReactNode } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { getPendingDraftCount } from "@/app/actions/drafts"
import { getPendingReplyCount } from "@/app/actions/engagement"
import { getAgentConfig } from "@/app/actions/agent"
import { getUnreadNotificationCount } from "@/app/actions/notifications"
import { AlertCircleIcon } from "hugeicons-react"
import { getActiveTenantMembership } from "@/lib/auth"
import { isLiveblocksConfigured } from "@/lib/liveblocks"
import { JoeyLiveblocksProvider } from "@/components/collaboration/liveblocks-provider"
import Link from "next/link"
import { ProductTour } from "@/components/product-tour"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [{ count }, { config }, { count: pendingReplyCount }, { count: unreadNotificationCount }, membership] = await Promise.all([
    getPendingDraftCount(),
    getAgentConfig(),
    getPendingReplyCount(),
    getUnreadNotificationCount(),
    getActiveTenantMembership().catch(() => null),
  ])
  const isPaused = config?.isPaused
  const tenantId = membership?.tenantId ?? null
  const pauseMessage = config?.pauseReason === "budget_exceeded"
    ? "Your AI budget has been reached. Review usage and budget settings to resume."
    : config?.pauseReason === "api_failure"
      ? "An integration needs attention. Check your connected accounts and API keys."
      : "Automatic drafting is paused. Review your schedule in Settings to resume."

  const liveblocksConfigured = isLiveblocksConfigured()

  return (
    <JoeyLiveblocksProvider isConfigured={liveblocksConfigured} tenantId={tenantId}>
      <ProductTour />
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" pendingDraftCount={count || 0} pendingReplyCount={pendingReplyCount || 0} />
        <SidebarInset>
          <SiteHeader unreadNotificationCount={unreadNotificationCount || 0} />
          {isPaused && (
              <div className="bg-red-500 text-white px-4 py-2 text-sm flex items-center justify-center gap-2">
                  <AlertCircleIcon className="w-4 h-4" />
                  <span><strong>Automation paused:</strong> {pauseMessage} <Link href="/settings" className="underline font-medium">Open Settings</Link></span>
              </div>
          )}
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                <div className="px-4 lg:px-6">
                   {children}
                </div>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </JoeyLiveblocksProvider>
  )
}
