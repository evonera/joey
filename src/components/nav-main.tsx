"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export interface NavItem {
  title: string
  url: string
  icon?: React.ComponentType<{ className?: string }>
  badge?: number
}

export interface NavSection {
  label?: string
  items: NavItem[]
}

export function NavMain({
  sections,
  items,
}: {
  sections?: NavSection[]
  items?: NavItem[]
}) {
  const pathname = usePathname()
  const renderedSections: NavSection[] = sections || (items ? [{ items }] : [])

  return (
    <div className="flex flex-col gap-3 py-1">
      {renderedSections.map((section, idx) => (
        <SidebarGroup key={section.label || idx} className="py-0 px-2">
          {section.label && (
            <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 mb-1">
              {section.label}
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.url ||
                  (item.url !== "/dashboard" && pathname?.startsWith(item.url))
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      asChild
                      isActive={isActive}
                      className={cn(
                        "rounded-lg transition-colors font-medium text-sm text-foreground/80 hover:text-foreground",
                        isActive &&
                          "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                      )}
                    >
                      <Link
                        href={item.url}
                        className="flex items-center justify-between w-full"
                      >
                        <div className="flex items-center gap-2.5">
                          {item.icon && (
                            <item.icon
                              className={cn(
                                "size-4 shrink-0 transition-colors",
                                isActive
                                  ? "text-[#ffe633]"
                                  : "text-muted-foreground"
                              )}
                            />
                          )}
                          <span>{item.title}</span>
                        </div>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="ml-auto bg-[#ffe633] text-[#0a0908] py-0.5 px-2 rounded-full text-[10px] font-bold shrink-0 shadow-xs">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </div>
  )
}
