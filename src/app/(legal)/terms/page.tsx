import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Joey",
  description: "Joey terms of service governing the use of the open-source social media automation platform.",
  robots: { index: false },
};

export default function TermsPage() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight mb-8">Terms of Service</h1>
      <div className="space-y-6 text-white/70 leading-relaxed text-sm">
        <p><strong>Last updated:</strong> October 11, 2026</p>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using Joey, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">2. Description of Service</h2>
          <p>Joey is an open-source, BYOK (bring your own key) autonomous social media agent. The platform analyzes brand voice, curates content, and drafts social media posts. Users retain full control over content via a human-in-the-loop approval process before any content is published.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">3. User Responsibilities</h2>
          <p>You are responsible for all content generated and published through your account. You must comply with the terms of service of any third-party platforms (Twitter/X, LinkedIn, Facebook) you connect to Joey. You must not use Joey for spam, harassment, or any unlawful purpose.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">4. Open Source License</h2>
          <p>The Joey source code is licensed under the MIT License. The hosted service is provided as-is without warranty. The source-code license does not include hosted infrastructure, model usage or third-party services. Your use of those services remains subject to their terms.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">5. Hosted plans and payment</h2>
          <p>The Free hosted plan has limited usage. Creator, Pro and Agency are monthly subscriptions billed per workspace. Prices and limits are shown on <Link href="/#pricing" className="underline">pricing</Link> and in Settings → Billing. Taxes, currency conversion and the total payable are shown at checkout. Dodo Payments processes purchases and provides payment receipts and the billing portal. Subscriptions renew automatically until cancelled. Model usage with your own API keys is billed separately by your model provider. The ability to own additional workspaces does not include paid service for those workspaces; each has its own billing.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">6. Plan changes, cancellation and refunds</h2>
          <p>Use Settings → Billing → Manage billing to view renewal dates, change payment methods, download invoices or cancel. The portal shows the effective date and any amount due before you confirm a plan change. An upgrade requires successful payment; a scheduled downgrade keeps your current plan until its effective date. Cancellation at the next billing date stops renewal and retains paid access for the current period. Immediate cancellation ends paid access immediately. Cancellation does not itself request a refund. See our <Link href="/cancellation" className="underline">cancellation instructions</Link> and <Link href="/refunds" className="underline">refund policy</Link> for the 7-day first-payment refund window and renewal review process.</p>
          <p>When paid access ends, Free limits apply. New video renders and autonomous scheduled work require paid access. Existing content remains available for review; exceeding a Free resource limit prevents creating more of that resource. Previously approved publication jobs may still complete, so cancel unwanted posts separately. Failed payments can restrict paid features; use Manage billing or contact us to resolve them.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">7. Limitation of Liability</h2>
          <p>To the extent permitted by applicable law, Joey and Evonera are not liable for indirect, incidental or consequential loss from content errors, scheduling failures or third-party platform changes. Nothing in these terms excludes mandatory consumer rights or liability that cannot lawfully be excluded.</p>
        </section>
        <section>
          <h2 className="text-lg font-medium text-white mb-2">8. Contact</h2>
          <p>For service, billing or cancellation support, email <a href="mailto:joey@evonera.net" className="underline">joey@evonera.net</a>.</p>
        </section>
      </div>
    </div>
  );
}
