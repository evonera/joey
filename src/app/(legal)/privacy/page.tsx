import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Joey",
  description: "Joey privacy policy. Learn how we handle your data, API keys, and social media account information.",
  robots: { index: false },
};

export default function PrivacyPage() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight mb-8">Privacy Policy</h1>
      <div className="space-y-6 text-white/70 leading-relaxed text-sm">
        <p><strong>Last updated:</strong> October 11, 2026</p>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">1. Information We Collect</h2>
          <p>When you sign up for Joey, we collect your name, email address, and account credentials. When you connect social media accounts, we store OAuth tokens necessary to authenticate with third-party platforms (Twitter/X, LinkedIn, Facebook). We also store drafts, uploaded images and videos, source links, branding, approvals and publishing history. For billing we store customer and subscription identifiers, plan and payment status, and checkout references. Payment details are collected by Dodo Payments; Joey does not store full card numbers or card security codes.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">2. How We Use Your Information</h2>
          <p>We use your information solely to operate the Joey platform: authenticating your account, generating and storing social media drafts, posting approved content on your behalf, and improving the service. We do not sell, rent, or share your personal data with third parties for their own marketing purposes.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">3. Data Security</h2>
          <p>Joey encrypts stored integration secrets using AES-256-GCM and uses HTTPS for the hosted service. Access controls limit workspace data to authorized members. No storage or transmission system can guarantee absolute security.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">4. Data Retention</h2>
          <p>We retain your account data for as long as your account is active. You may request access, correction or deletion of your account data by contacting joey@evonera.net. Billing records and security logs may be retained as needed for legal obligations, disputes and fraud prevention. Copies held by payment or social platforms follow their own retention rules. Deleting a Joey account does not remove posts already published on social networks; cancel subscriptions and scheduled posts before deletion.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">5. Service providers and transfers</h2>
          <p>We share the data needed to provide the features you use with hosting and database providers (Vercel and Neon), media storage and rendering providers (Cloudflare R2 and Modal), Dodo Payments for billing, connected social platforms and publishing providers such as Zernio, and the model or research providers you select. Content sent for generation or rendering can include your drafts and media. These providers may process data outside your country under their own terms and safeguards. Dodo’s handling of purchase data is described in its <a href="https://dodopayments.com/privacy-policy" className="underline">privacy policy</a>.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">6. Cookies and operational data</h2>
          <p>Authentication cookies keep you signed in and identify your active workspace. We collect operational logs and error information to maintain the service and investigate failures, including failed checkout and publishing requests.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">7. Contact</h2>
          <p>For privacy inquiries, email joey@evonera.net.</p>
        </section>
      </div>
    </div>
  );
}
