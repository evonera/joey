'use server';

import { getActiveTenantId } from "@/lib/auth";
import { db } from "@/lib/db";
import { themeContentFormats, themeSlots } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export interface CreateContentFormatInput {
  slug: string;
  name: string;
  platform: string;
  mediaType: 'image' | 'carousel' | 'video';
  aspectRatio?: string;
  width?: number;
  height?: number;
  durationRange?: { minSeconds: number; maxSeconds: number };
  renderer: 'puppeteer' | 'remotion';
  templateComponentPath?: string;
  defaultPropsSchema?: Record<string, unknown>;
}

export interface UpdateContentFormatInput {
  name?: string;
  platform?: string;
  mediaType?: 'image' | 'carousel' | 'video';
  aspectRatio?: string;
  width?: number;
  height?: number;
  durationRange?: { minSeconds: number; maxSeconds: number };
  renderer?: 'puppeteer' | 'remotion';
  templateComponentPath?: string;
  defaultPropsSchema?: Record<string, unknown>;
}

const DEFAULT_FORMATS: Omit<CreateContentFormatInput, 'slug'>[] = [
  {
    name: "Instagram Square Card",
    platform: "instagram",
    mediaType: "image",
    aspectRatio: "1:1",
    width: 1080,
    height: 1080,
    renderer: "puppeteer",
    templateComponentPath: "cards/SquareNewsCard",
  },
  {
    name: "Instagram Portrait Card",
    platform: "instagram",
    mediaType: "image",
    aspectRatio: "4:5",
    width: 1080,
    height: 1350,
    renderer: "puppeteer",
    templateComponentPath: "cards/PortraitNewsCard",
  },
  {
    name: "Instagram Carousel (10-Slide)",
    platform: "instagram",
    mediaType: "carousel",
    aspectRatio: "1:1",
    width: 1080,
    height: 1080,
    renderer: "puppeteer",
    templateComponentPath: "carousels/StandardCarousel",
  },
  {
    name: "Instagram Reel / TikTok Short",
    platform: "instagram",
    mediaType: "video",
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
    durationRange: { minSeconds: 15, maxSeconds: 90 },
    renderer: "remotion",
    templateComponentPath: "compositions/VerticalNewsReel",
  },
  {
    name: "X (Twitter) Landscape Card",
    platform: "x",
    mediaType: "image",
    aspectRatio: "16:9",
    width: 1200,
    height: 675,
    renderer: "puppeteer",
    templateComponentPath: "cards/TwitterLandscapeCard",
  },
];

export async function getContentFormats() {
  try {
    const tenantId = await getActiveTenantId();
    let formats = await db.query.themeContentFormats.findMany({
      where: eq(themeContentFormats.tenantId, tenantId),
      orderBy: [desc(themeContentFormats.createdAt)],
    });

    if (formats.length === 0) {
      await seedDefaultFormats();
      formats = await db.query.themeContentFormats.findMany({
        where: eq(themeContentFormats.tenantId, tenantId),
        orderBy: [desc(themeContentFormats.createdAt)],
      });
    }

    return { formats };
  } catch (error: any) {
    console.error("Failed to fetch content formats:", error);
    return { error: "Failed to fetch content formats" };
  }
}

export async function seedDefaultFormats() {
  try {
    const tenantId = await getActiveTenantId();
    const slugs = [
      "instagram-card-1080",
      "instagram-card-portrait-1080",
      "instagram-carousel-1080",
      "instagram-reel-9x16",
      "x-card-1200x675",
    ];

    for (let i = 0; i < DEFAULT_FORMATS.length; i++) {
      const def = DEFAULT_FORMATS[i];
      const slug = slugs[i];

      const existing = await db.query.themeContentFormats.findFirst({
        where: and(eq(themeContentFormats.tenantId, tenantId), eq(themeContentFormats.slug, slug)),
      });

      if (!existing) {
        await db.insert(themeContentFormats).values({
          tenantId,
          slug,
          name: def.name,
          platform: def.platform,
          mediaType: def.mediaType,
          aspectRatio: def.aspectRatio,
          width: def.width,
          height: def.height,
          durationRange: def.durationRange,
          renderer: def.renderer,
          templateComponentPath: def.templateComponentPath,
          defaultPropsSchema: def.defaultPropsSchema,
        });
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error("Failed to seed default formats:", error);
    return { error: "Failed to seed default formats" };
  }
}

export async function createContentFormat(data: CreateContentFormatInput) {
  try {
    const tenantId = await getActiveTenantId();

    if (!data.slug || !data.slug.trim()) {
      return { error: "Format slug is required" };
    }
    if (!data.name || !data.name.trim()) {
      return { error: "Format name is required" };
    }

    const existing = await db.query.themeContentFormats.findFirst({
      where: and(eq(themeContentFormats.tenantId, tenantId), eq(themeContentFormats.slug, data.slug.trim())),
    });

    if (existing) {
      return { error: "A format with this slug already exists" };
    }

    const [format] = await db.insert(themeContentFormats).values({
      tenantId,
      slug: data.slug.trim(),
      name: data.name.trim(),
      platform: data.platform,
      mediaType: data.mediaType,
      aspectRatio: data.aspectRatio,
      width: data.width,
      height: data.height,
      durationRange: data.durationRange,
      renderer: data.renderer,
      templateComponentPath: data.templateComponentPath,
      defaultPropsSchema: data.defaultPropsSchema,
    }).returning();

    return { format };
  } catch (error: any) {
    console.error("Failed to create content format:", error);
    return { error: "Failed to create content format" };
  }
}

export async function updateContentFormat(id: string, data: UpdateContentFormatInput) {
  try {
    const tenantId = await getActiveTenantId();

    const [updated] = await db.update(themeContentFormats)
      .set({
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.platform !== undefined ? { platform: data.platform } : {}),
        ...(data.mediaType !== undefined ? { mediaType: data.mediaType } : {}),
        ...(data.aspectRatio !== undefined ? { aspectRatio: data.aspectRatio } : {}),
        ...(data.width !== undefined ? { width: data.width } : {}),
        ...(data.height !== undefined ? { height: data.height } : {}),
        ...(data.durationRange !== undefined ? { durationRange: data.durationRange } : {}),
        ...(data.renderer !== undefined ? { renderer: data.renderer } : {}),
        ...(data.templateComponentPath !== undefined ? { templateComponentPath: data.templateComponentPath } : {}),
        ...(data.defaultPropsSchema !== undefined ? { defaultPropsSchema: data.defaultPropsSchema } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(themeContentFormats.id, id), eq(themeContentFormats.tenantId, tenantId)))
      .returning();

    if (!updated) {
      return { error: "Content format not found" };
    }

    return { format: updated };
  } catch (error: any) {
    console.error("Failed to update content format:", error);
    return { error: "Failed to update content format" };
  }
}

export async function deleteContentFormat(id: string) {
  try {
    const tenantId = await getActiveTenantId();

    // Check if slots are using this format
    const slotsUsingFormat = await db.query.themeSlots.findMany({
      where: and(eq(themeSlots.formatId, id), eq(themeSlots.tenantId, tenantId)),
      limit: 1,
    });

    if (slotsUsingFormat.length > 0) {
      return { error: "Cannot delete format: it is currently referenced by one or more daily mix slots" };
    }

    await db.delete(themeContentFormats)
      .where(and(eq(themeContentFormats.id, id), eq(themeContentFormats.tenantId, tenantId)));

    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete content format:", error);
    return { error: "Failed to delete content format" };
  }
}
