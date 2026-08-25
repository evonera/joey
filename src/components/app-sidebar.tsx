"use client"

import * as React from "react"
import {
  IconDashboard,
  IconFileText,
  IconSettings,
  IconUsers,
  IconBook,
  IconBulb,
  IconPhoto,
  IconMessage,
  IconChartBar,
  IconGitBranch,
} from "@tabler/icons-react"

import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { WorkspaceSwitcher } from "./workspace-switcher"

export function AppSidebar({ pendingDraftCount, pendingReplyCount, ...props }: React.ComponentProps<typeof Sidebar> & { pendingDraftCount?: number; pendingReplyCount?: number }) {
  const navMain = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: IconDashboard,
    },
    {
      title: "Drafts",
      url: "/drafts",
      icon: IconFileText,
      badge: pendingDraftCount,
    },
    {
      title: "Engagement",
      url: "/engagement",
      icon: IconMessage,
      badge: pendingReplyCount,
    },
    {
      title: "Accounts",
      url: "/accounts",
      icon: IconUsers,
    },
    {
      title: "Brand Kit",
      url: "/brandkit",
      icon: IconBook,
    },
    {
      title: "Insights",
      url: "/insights",
      icon: IconBulb,
    },
    {
      title: "Analytics",
      url: "/analytics",
      icon: IconChartBar,
    },
    {
      title: "Flows",
      url: "/flows",
      icon: IconGitBranch,
    },
    {
      title: "Assets",
      url: "/assets",
      icon: IconPhoto,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: IconSettings,
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
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
    </Sidebar>
  )
}
