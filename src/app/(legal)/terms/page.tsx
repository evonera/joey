import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Joey",
  description: "Joey terms of service governing the use of the open-source social media automation platform.",
  robots: { index: false },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
      <div className="space-y-6 text-zinc-600 dark:text-zinc-400 leading-relaxed">
        <p><strong>Last updated:</strong> July 28, 2026</p>
        <section>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using Joey, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">2. Description of Service</h2>
          <p>Joey is an open-source, BYOK (bring your own key) autonomous social media agent. The platform analyzes brand voice, curates content, and drafts social media posts. Users retain full control over content via a human-in-the-loop approval process before any content is published.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">3. User Responsibilities</h2>
          <p>You are responsible for all content generated and published through your account. You must comply with the terms of service of any third-party platforms (Twitter/X, LinkedIn, Facebook) you connect to Joey. You must not use Joey for spam, harassment, or any unlawful purpose.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">4. Open Source License</h2>
          <p>The Joey source code is licensed under the MIT License. The hosted service is provided as-is without warranty. Self-hosted instances are governed solely by the MIT License.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">5. Limitation of Liability</h2>
          <p>Joey and Evonera shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform, including but not limited to content errors, scheduling failures, or third-party platform API changes.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">6. Contact</h2>
          <p>For questions about these terms, email support@joey.ai.</p>
        </section>
      </div>
    </div>
  );
}
