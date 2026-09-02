"use client"

import * as React from "react"
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

import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { OrganizationSwitcher } from "@/components/auth/OrganizationSwitcher"

export function AppSidebar({ pendingDraftCount, pendingReplyCount, ...props }: React.ComponentProps<typeof Sidebar> & { pendingDraftCount?: number; pendingReplyCount?: number }) {
  const navMain = [
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
    {
      title: "Accounts",
      url: "/accounts",
      icon: UserMultiple02Icon,
    },
    {
      title: "Brand Kit",
      url: "/brandkit",
      icon: PaintBoardIcon,
    },
    {
      title: "Insights",
      url: "/insights",
      icon: BulbIcon,
    },
    {
      title: "Analytics",
      url: "/analytics",
      icon: Analytics01Icon,
    },
    {
      title: "Flows",
      url: "/flows",
      icon: GitForkIcon,
    },
    {
      title: "Theme Studio",
      url: "/theme-studio",
      icon: SparklesIcon,
    },
    {
      title: "Assets",
      url: "/assets",
      icon: Image01Icon,
    },
    {
      title: "Operations",
      url: "/operations",
      icon: Activity01Icon,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings02Icon,
    },
  ];

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="/dashboard">
                <span className="text-xl font-bold">Joey.ai</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <OrganizationSwitcher className="w-full mt-2" />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
    </Sidebar>
  )
}
