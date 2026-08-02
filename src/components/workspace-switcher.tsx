"use client"

import * as React from "react"
import { IconBuilding, IconCheck, IconPlus, IconSelector } from "@tabler/icons-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { authClient } from "@/lib/auth-client"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"

export function WorkspaceSwitcher() {
  const { isMobile } = useSidebar()
  const { data: orgs } = authClient.useListOrganizations()
  const { data: activeOrg } = authClient.useActiveOrganization()
  
  const [showNewWorkspaceDialog, setShowNewWorkspaceDialog] = React.useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = React.useState("")
  const [isCreating, setIsCreating] = React.useState(false)

  const handleSetActive = async (organizationId: string) => {
    await authClient.organization.setActive({ organizationId })
    window.location.reload()
  }

  const handleCreateNew = async () => {
    if (!newWorkspaceName.trim()) return
    setIsCreating(true)
    try {
      const name = newWorkspaceName.trim()
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(7)
      const res = await authClient.organization.create({ name, slug })
      if (res?.data?.id) {
        await authClient.organization.setActive({ organizationId: res.data.id })
      }
      setShowNewWorkspaceDialog(false)
      setNewWorkspaceName("")
      window.location.reload()
    } catch (e) {
      console.error(e)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <IconBuilding className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {activeOrg?.name || "No Workspace"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {/* Better-Auth strips custom fields from the default hooks sometimes, but we can access it if configured */}
                  Workspace
                </span>
              </div>
              <IconSelector className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            {orgs?.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => handleSetActive(org.id)}
                className="gap-2 p-2"
              >
                <Avatar className="h-6 w-6 rounded-md">
                  <AvatarFallback className="rounded-md">
                    {org.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate">{org.name}</span>
                {activeOrg?.id === org.id && <IconCheck className="size-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" onSelect={(e) => {
              e.preventDefault()
              setShowNewWorkspaceDialog(true)
            }}>
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <IconPlus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">Add workspace</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <Dialog open={showNewWorkspaceDialog} onOpenChange={setShowNewWorkspaceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
            <DialogDescription>
              Create a new team workspace to collaborate with others.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input 
              placeholder="Workspace Name" 
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              disabled={isCreating}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewWorkspaceDialog(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreateNew} disabled={!newWorkspaceName.trim() || isCreating}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarMenu>
  )
}
