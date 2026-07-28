'use server';

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { tenants, notifications, notificationPreferences, user } from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { sendNotificationEmail } from "@/lib/email";

import { getActiveTenantId } from "@/lib/auth";

async function getAuthData() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const tenantId = await getActiveTenantId();
  return { tenantId, user: session.user };
}

export async function getNotifications(opts?: { limit?: number; offset?: number; unreadOnly?: boolean }) {
  try {
    const { tenantId } = await getAuthData();
    const limit = opts?.limit || 50;
    const offset = opts?.offset || 0;
    
    let whereClause = eq(notifications.tenantId, tenantId);
    if (opts?.unreadOnly) {
      whereClause = and(whereClause, eq(notifications.isRead, false))!;
    }

    const data = await db.query.notifications.findMany({
      where: whereClause,
      orderBy: [desc(notifications.createdAt)],
      limit,
      offset,
    });
    
    const unreadCountResult = await db.select({ value: count() }).from(notifications).where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false)));

    return { notifications: data, unreadCount: unreadCountResult[0].value };
  } catch (error: any) {
    console.error("Failed to fetch notifications:", error);
    return { error: error.message || "Failed to fetch notifications" };
  }
}

export async function markAsRead(notificationId: string) {
  try {
    const { tenantId } = await getAuthData();
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.tenantId, tenantId)));
    return { success: true };
  } catch (error: any) {
    return { error: error.message || "Failed to mark as read" };
  }
}

export async function markAllAsRead() {
  try {
    const { tenantId } = await getAuthData();
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false)));
    return { success: true };
  } catch (error: any) {
    return { error: error.message || "Failed to mark all as read" };
  }
}

export async function getUnreadNotificationCount() {
  try {
    const { tenantId } = await getAuthData();
    const result = await db.select({ value: count() }).from(notifications).where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false)));
    return { count: result[0].value };
  } catch (error: any) {
    return { error: error.message || "Failed to get unread count" };
  }
}

export async function getNotificationPreferences() {
  try {
    const { tenantId, user } = await getAuthData();
    let prefs = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.tenantId, tenantId)
    });

    if (!prefs) {
      const [newPrefs] = await db.insert(notificationPreferences).values({
        tenantId,
        emailAddress: user.email,
      }).returning();
      prefs = newPrefs;
    }

    return { preferences: prefs };
  } catch (error: any) {
    console.error("Failed to fetch notification preferences:", error);
    return { error: error.message || "Failed to fetch preferences" };
  }
}

export async function saveNotificationPreferences(data: Partial<typeof notificationPreferences.$inferInsert>) {
  try {
    const { tenantId } = await getAuthData();
    
    // Ensure tenantId is not overwritten
    delete data.tenantId;
    delete data.id;
    
    const [updated] = await db.insert(notificationPreferences)
      .values({
        tenantId,
        ...data,
      } as any)
      .onConflictDoUpdate({
        target: notificationPreferences.tenantId,
        set: {
          ...data,
          updatedAt: new Date(),
        }
      })
      .returning();

    return { preferences: updated };
  } catch (error: any) {
    console.error("Failed to save notification preferences:", error);
    return { error: error.message || "Failed to save preferences" };
  }
}

