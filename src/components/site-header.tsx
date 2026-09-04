import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NotificationBell } from "@/components/notification-bell"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserButton } from "@/components/auth/UserButton"
import { HelpTutorialDialog } from "@/components/help-tutorial-dialog"

export function SiteHeader({ unreadNotificationCount = 0 }: { unreadNotificationCount?: number }) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-xl transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) sticky top-0 z-40">
      <div className="flex w-full items-center gap-2 px-4 lg:gap-3 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-1 data-[orientation=vertical]:h-4 bg-border"
        />
        <h1 className="text-sm font-semibold tracking-tight text-foreground">Joey</h1>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <HelpTutorialDialog />
          <NotificationBell initialUnreadCount={unreadNotificationCount} />
          <ThemeToggle />
          <UserButton />
        </div>
      </div>
    </header>
  )
}
