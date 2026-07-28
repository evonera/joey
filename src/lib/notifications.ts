import { db } from "@/lib/db";
import { tenants, notifications, notificationPreferences, user, member } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendNotificationEmail } from "@/lib/email";

export async function createNotification(
  tenantId: string, 
  type: 'draft_ready' | 'engagement_reply_needed' | 'api_failure' | 'publish_success' | 'publish_failed', 
  title: string, 
  body: string, 
  opts?: { link?: string; metadata?: any }
) {
  try {
    let prefs = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.tenantId, tenantId)
    });

    if (!prefs) {
      // Create defaults. Need owner email.
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId)
      });
      if (tenant) {
        const membership = await db.query.member.findFirst({
          where: eq(member.organizationId, tenantId)
        });
        const owner = membership ? await db.query.user.findFirst({
          where: eq(user.id, membership.userId)
        }) : null;
        const [newPrefs] = await db.insert(notificationPreferences).values({
          tenantId,
          emailAddress: owner?.email || null,
        }).returning();
        prefs = newPrefs;
      }
    }

    if (!prefs) return; // Should not happen, but fail safe

    // Check in-app preferences
    let shouldCreateInApp = true;
    switch (type) {
      case 'draft_ready': shouldCreateInApp = prefs.inAppDraftReady; break;
      case 'engagement_reply_needed': shouldCreateInApp = prefs.inAppEngagementReply; break;
      case 'api_failure': shouldCreateInApp = prefs.inAppApiFailure; break;
      case 'publish_success': shouldCreateInApp = prefs.inAppPublishSuccess; break;
      case 'publish_failed': shouldCreateInApp = prefs.inAppPublishFailed; break;
    }

    if (shouldCreateInApp) {
      await db.insert(notifications).values({
        tenantId,
        type,
        title,
        body,
        link: opts?.link,
        metadata: opts?.metadata,
      });
    }

    // Check email preferences
    let shouldSendEmail = false;
    switch (type) {
      case 'draft_ready': shouldSendEmail = prefs.emailDraftReady; break;
      case 'engagement_reply_needed': shouldSendEmail = prefs.emailEngagementReply; break;
      case 'api_failure': shouldSendEmail = prefs.emailApiFailure; break;
      case 'publish_success': shouldSendEmail = prefs.emailPublishSuccess; break;
      case 'publish_failed': shouldSendEmail = prefs.emailPublishFailed; break;
    }

    if (shouldSendEmail && prefs.emailAddress) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const fullLink = opts?.link ? (opts.link.startsWith('http') ? opts.link : `${appUrl}${opts.link}`) : null;
      
      await sendNotificationEmail({
        to: prefs.emailAddress,
        subject: title,
        body,
        tenantId,
        link: fullLink,
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Failed to create notification:", error);
    // Internal function, we usually don't want to break the main flow (like publishing) if notification fails
    return { success: false, error: error.message };
  }
}
