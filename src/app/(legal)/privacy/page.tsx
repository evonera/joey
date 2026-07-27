import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Joey",
  description: "Joey privacy policy. Learn how we handle your data, API keys, and social media account information.",
  robots: { index: false },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      <div className="space-y-6 text-zinc-600 dark:text-zinc-400 leading-relaxed">
        <p><strong>Last updated:</strong> July 28, 2026</p>
        <section>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">1. Information We Collect</h2>
          <p>When you sign up for Joey, we collect your name, email address, and account credentials. When you connect social media accounts, we store OAuth tokens necessary to authenticate with third-party platforms (Twitter/X, LinkedIn, Facebook). We also collect content drafts you generate and approve through the platform.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">2. How We Use Your Information</h2>
          <p>We use your information solely to operate the Joey platform: authenticating your account, generating and storing social media drafts, posting approved content on your behalf, and improving the service. We do not sell, rent, or share your personal data with third parties for their own marketing purposes.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">3. Data Security</h2>
          <p>All API keys and OAuth tokens are encrypted at rest using AES-256-GCM. Data in transit is protected by TLS 1.3. We follow industry-standard security practices and regularly audit our dependencies for vulnerabilities.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">4. Data Retention</h2>
          <p>We retain your account data for as long as your account is active. You may request deletion of your account and associated data at any time by contacting support@joey.ai.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">5. Contact</h2>
          <p>For privacy inquiries, email support@joey.ai.</p>
        </section>
      </div>
    </div>
  );
}
