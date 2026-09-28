'use client';

import * as React from 'react';
import Link from 'next/link';
import { getCreationShelf } from '@/app/actions/creation-shelf';
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';

type Shelf = Awaited<ReturnType<typeof getCreationShelf>>;

export function ThemeShelfSidebar() {
  const [shelf, setShelf] = React.useState<Shelf | null>(null);
  const { setOpenMobile } = useSidebar();

  React.useEffect(() => {
    let active = true;
    getCreationShelf().then((result) => { if (active) setShelf(result); }).catch(() => {});
    return () => { active = false; };
  }, []);

  if (!shelf?.posts.length && !shelf?.templates.length) return null;

  return <SidebarGroup className="px-2 py-0">
    <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">From Theme Studio</SidebarGroupLabel>
    <SidebarMenu className="gap-0.5">
      {shelf.posts.slice(0, 2).map((post) => <SidebarMenuItem key={post.id}>
        <SidebarMenuButton asChild tooltip={post.title}>
          <Link href={`/drafts?tab=all&source=theme_studio&search=${encodeURIComponent(post.title)}`} onClick={() => setOpenMobile(false)} className="min-w-0"><span className="truncate">{post.title}</span></Link>
        </SidebarMenuButton>
      </SidebarMenuItem>)}
      {shelf.templates.slice(0, 2).map((template) => <SidebarMenuItem key={template.id}>
        <SidebarMenuButton asChild tooltip={template.name}>
          <Link href={template.themePageId ? `/theme-studio/${template.themePageId}/templates/${template.id}` : '/theme-studio'} onClick={() => setOpenMobile(false)} className="min-w-0"><span className="truncate">Template · {template.name}</span></Link>
        </SidebarMenuButton>
      </SidebarMenuItem>)}
    </SidebarMenu>
  </SidebarGroup>;
}
