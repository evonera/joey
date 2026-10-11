import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Refund Policy — Joey", description: "Joey billing policies and customer support.", robots: { index: false } };
export default function PolicyPage() {
  return <div><h1 className="text-3xl font-semibold tracking-tight mb-8">Refund Policy</h1>
    <div className="space-y-6 text-white/70 leading-relaxed text-sm">
      <p><strong>Last updated:</strong> October 11, 2026</p>
        <section><h2 className="text-lg font-medium text-white mb-2">First subscription payment</h2><p>Your first Joey subscription payment is eligible for a full refund if you request it within 7 days of that payment. Email joey@evonera.net from the email used to purchase, and include your workspace name and receipt or payment ID. Do not send passwords, card numbers or security codes. The 7-day window applies to your initial subscription purchase, not every renewal or plan change.</p></section>
        <section><h2 className="text-lg font-medium text-white mb-2">Renewals and other charges</h2><p>Renewal and plan-change refund requests are reviewed case by case. Contact us promptly and explain the issue. Report duplicate, incorrect or unauthorized charges so we can investigate with the payment provider. This policy does not limit any mandatory consumer rights or refund entitlement under applicable law.</p></section>
        <section><h2 className="text-lg font-medium text-white mb-2">Cancellation and processing</h2><p>Cancelling prevents future renewal according to the cancellation option you choose; it does not automatically submit a refund request. Tell us if you also want to cancel when requesting a refund. Approved refunds are processed through Dodo Payments to the original payment method where supported. The time to appear depends on the payment method and financial institution. A refund may end the corresponding paid access.</p></section>
      <p><Link href="/refunds" className="underline">Refund policy</Link> · <Link href="/cancellation" className="underline">Cancellation</Link> · <Link href="/terms" className="underline">Terms</Link> · <a href="mailto:joey@evonera.net" className="underline">Contact support</a></p>
    </div></div>;
}
