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
import { AlertCircle } from "lucide-react"

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { count } = await getPendingDraftCount()
  const { config } = await getAgentConfig()
  const { count: pendingReplyCount } = await getPendingReplyCount()
  const isPaused = config?.isPaused

  return (
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
        <SiteHeader />
        {isPaused && (
            <div className="bg-red-500 text-white px-4 py-2 text-sm flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span><strong>Automation Paused:</strong> Your Zernio API key is invalid or revoked. Please update it in Settings to resume drafting and publishing.</span>
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
  )
}
