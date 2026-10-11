import Link from "next/link";
import { JoeyLogo } from "@/components/joey-logo";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0908] text-white">
      <header className="px-6 py-4 flex items-center justify-between max-w-4xl mx-auto w-full border-b border-white/[0.06]">
        <JoeyLogo size="sm" />
        <nav aria-label="Legal navigation" className="flex items-center gap-4 text-xs">
          <Link href="/" className="text-white/60 hover:text-white transition-colors">
            Home
          </Link>
          <Link href="/docs" className="text-white/60 hover:text-white transition-colors">
            Docs
          </Link>
          <Link
            href="/signup"
            className="btn-accent px-3 py-1.5 rounded-lg font-semibold text-black"
          >
            Get Started
          </Link>
        </nav>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        {children}
      </main>
      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-white/40">
        <nav aria-label="Policies" className="flex flex-wrap justify-center gap-4 mb-4"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/refunds">Refunds</Link><Link href="/cancellation">Cancellation</Link><a href="mailto:joey@evonera.net">Contact</a></nav>
        &copy; {new Date().getFullYear()} Evonera. MIT Licensed.
      </footer>
    </div>
  );
}
