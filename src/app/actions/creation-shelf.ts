'use server';

import { getActiveTenantId } from '@/lib/auth';
import { db } from '@/lib/db';
import { contentPackages, drafts, themeContentFormats, themePages, themeVisualTemplates } from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';

function mediaUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (item && typeof item === 'object' && 'url' in item && typeof item.url === 'string') return [item.url];
    return [];
  });
}

export async function getCreationShelf() {
  const tenantId = await getActiveTenantId();
  const [draftRows, packageRows, templateRows, pageRows, formatRows] = await Promise.all([
    db.query.drafts.findMany({
      where: and(eq(drafts.tenantId, tenantId), inArray(drafts.status, ['draft', 'pending_review', 'approved', 'scheduled', 'rejected'])),
      orderBy: [desc(drafts.createdAt)],
      limit: 12,
    }),
    db.query.contentPackages.findMany({
      where: eq(contentPackages.tenantId, tenantId),
      orderBy: [desc(contentPackages.createdAt)],
      limit: 8,
    }),
    db.query.themeVisualTemplates.findMany({
      where: eq(themeVisualTemplates.tenantId, tenantId),
      orderBy: [desc(themeVisualTemplates.updatedAt)],
      limit: 8,
    }),
    db.query.themePages.findMany({
      where: eq(themePages.tenantId, tenantId),
      columns: { id: true, name: true },
    }),
    db.query.themeContentFormats.findMany({
      where: eq(themeContentFormats.tenantId, tenantId),
      columns: { id: true, name: true },
    }),
  ]);
  const pages = new Map(pageRows.map((page) => [page.id, page.name]));
  const formats = new Map(formatRows.map((format) => [format.id, format.name]));

  return {
    drafts: draftRows.map((draft) => {
      const options = draft.platformOptions as { accountId?: unknown; mediaUrls?: unknown } | null;
      return {
        id: draft.id,
        content: draft.content || '',
        status: draft.status,
        accountId: typeof options?.accountId === 'string' ? options.accountId : null,
        mediaUrls: mediaUrls(options?.mediaUrls),
        createdAt: draft.createdAt.toISOString(),
      };
    }),
    posts: packageRows.map((pkg) => ({
      id: pkg.id,
      themePageId: pkg.themePageId,
      themePageName: pages.get(pkg.themePageId) || 'Theme Studio',
      title: pkg.title,
      caption: pkg.caption || '',
      status: pkg.status,
      mediaUrls: mediaUrls(pkg.renderedAssetUrls),
      createdAt: pkg.createdAt.toISOString(),
    })),
    templates: templateRows.map((template) => ({
      id: template.id,
      themePageId: template.themePageId,
      themePageName: template.themePageId ? pages.get(template.themePageId) || 'Theme Studio' : 'Your templates',
      name: template.name,
      formatName: formats.get(template.formatId) || 'Visual format',
      previewUrl: template.previewUrl,
    })),
  };
}
