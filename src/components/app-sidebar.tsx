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
} from "hugeicons-react"

import { NavMain, type NavSection } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
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
          title: "Drafts",
          url: "/drafts",
          icon: File02Icon,
          badge: pendingDraftCount,
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
        {
          title: "Insights",
          url: "/insights",
          icon: BulbIcon,
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
    </Sidebar>
  )
}
