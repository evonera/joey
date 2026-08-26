import { Resend } from 'resend';

const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@joey.app';

// Constructed on first send so the app can boot without RESEND_API_KEY
// (self-hosted installs that don't use email).
function getResend(): Resend {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set — email sending is unavailable.");
    return new Resend(apiKey);
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await getResend().emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend API error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Failed to send email:", err);
    return { success: false, error: err.message || "Unknown error" };
  }
}

export interface NotificationEmailOptions {
  to: string;
  subject: string;
  body: string;
  tenantId: string;
  link?: string | null;
}

export async function sendNotificationEmail({ to, subject, body, tenantId, link }: NotificationEmailOptions) {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #333; margin-top: 0;">Joey</h2>
      <p style="color: #555; font-size: 16px; line-height: 1.5;">${escapeHtml(body)}</p>
      ${link ? `
        <div style="margin-top: 24px;">
          <a href="${link}" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            View Details
          </a>
        </div>
      ` : ''}
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0 20px;" />
      <p style="color: #999; font-size: 12px; margin: 0;">
        You're receiving this because you have notifications enabled for Joey. 
        You can update your preferences in your <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/settings" style="color: #4f46e5;">dashboard settings</a>.
      </p>
    </div>
  `;

  const res = await sendEmail({ to, subject, html });
  if (!res.success) {
    throw new Error(`Failed to send notification email: ${res.error || "Unknown error"}`);
  }
  return res;
}
