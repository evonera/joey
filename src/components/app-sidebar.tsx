"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import {
  DashboardSquare01Icon,
  File02Icon,
  Comment01Icon,
  UserMultiple02Icon,
  PaintBoardIcon,
  BulbIcon,
  Analytics01Icon,
  GitForkIcon,
  SparklesIcon,
  Image01Icon,
  Activity01Icon,
  Settings02Icon,
  NoteEditIcon,
  Calendar03Icon,
} from "hugeicons-react"
import {
  IconBook,
  IconCode,
  IconLifebuoy,
  IconBrandGithub,
} from "@tabler/icons-react"

import { authClient } from "@/lib/auth-client"
import { NavMain, type NavSection } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { OrganizationSwitcher } from "@/components/auth/OrganizationSwitcher"

export function AppSidebar({
  pendingDraftCount,
  pendingReplyCount,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  pendingDraftCount?: number
  pendingReplyCount?: number
}) {
  const navSections: NavSection[] = [
    {
      label: "Workflow",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: DashboardSquare01Icon,
        },
        {
          title: "Compose",
          url: "/compose",
          icon: NoteEditIcon,
        },
        {
          title: "Drafts",
          url: "/drafts",
          icon: File02Icon,
          badge: pendingDraftCount,
        },
        {
          title: "Calendar",
          url: "/calendar",
          icon: Calendar03Icon,
        },
        {
          title: "Engagement",
          url: "/engagement",
          icon: Comment01Icon,
          badge: pendingReplyCount,
        },
      ],
    },
    {
      label: "Studio",
      items: [
        {
          title: "Theme Studio",
          url: "/theme-studio",
          icon: SparklesIcon,
        },
        {
          title: "Flows",
          url: "/flows",
          icon: GitForkIcon,
        },
        {
          title: "Assets",
          url: "/assets",
          icon: Image01Icon,
        },
      ],
    },
    {
      label: "Intelligence",
      items: [
        {
          title: "Analytics",
          url: "/analytics",
          icon: Analytics01Icon,
        },
      ],
    },
    {
      label: "Setup & Admin",
      items: [
        {
          title: "Brand Kit",
          url: "/brandkit",
          icon: PaintBoardIcon,
        },
        {
          title: "Accounts",
          url: "/accounts",
          icon: UserMultiple02Icon,
        },
        {
          title: "Settings",
          url: "/settings",
          icon: Settings02Icon,
        },
        {
          title: "Operations",
          url: "/operations",
          icon: Activity01Icon,
        },
      ],
    },
  ]

  const secondaryItems = [
    {
      title: "Documentation",
      url: "/docs",
      icon: IconBook,
    },
    {
      title: "API Reference",
      url: "/api/openapi.json",
      icon: IconCode,
    },
    {
      title: "Support",
      url: "https://github.com/shakthivel/joey/issues",
      icon: IconLifebuoy,
    },
    {
      title: "GitHub",
      url: "https://github.com/shakthivel/joey",
      icon: IconBrandGithub,
    },
  ]

  const { data: session } = authClient.useSession()
  const user = {
    name: session?.user?.name || "Joey Creator",
    email: session?.user?.email || "creator@joey.ai",
    avatar: session?.user?.image || "",
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-10 hover:bg-sidebar-accent/50 transition-colors"
            >
              <Link href="/dashboard" className="flex items-center gap-2.5">
                <div className="size-7 rounded-md bg-[#ffe633]/20 border border-[#ffe633]/40 flex items-center justify-center shrink-0 p-0.5">
                  <Image
                    src="/joey-mascot.png"
                    alt="Joey"
                    width={22}
                    height={22}
                    className="object-contain"
                  />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold tracking-tight text-foreground">
                    Joey
                  </span>
                  <span className="text-xs font-semibold text-[#ffe633]">
                    .ai
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <OrganizationSwitcher className="w-full mt-1.5" />
      </SidebarHeader>
      <SidebarContent className="px-1">
        <NavMain sections={navSections} />
      </SidebarContent>
      <SidebarFooter>
        <NavSecondary items={secondaryItems} className="mt-auto" />
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
