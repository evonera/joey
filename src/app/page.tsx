import Link from "next/link";
import { ArrowRight, Bot, CalendarDays, BarChart3, ShieldCheck, ExternalLink } from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

const blogTeasers = [
  {
    href: "/blog/how-to-automate-social-media-with-ai",
    title: "How to Automate Social Media with AI in 2026",
    description: "What to automate, what to keep human, and how agentic workflows actually draft posts.",
  },
  {
    href: "/blog/open-source-social-media-management-joey-vs-buffer-vs-hootsuite",
    title: "Joey vs Buffer vs Hootsuite",
    description: "Open-source AI social media management compared with the subscription incumbents.",
  },
  {
    href: "/blog/what-is-byok-bring-your-own-key-explained",
    title: "What is BYOK AI?",
    description: "Why bringing your own API keys cuts costs and keeps your data yours.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col font-sans">

      {/* Navigation */}
      <header className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xl">
            J
          </div>
          <span className="text-xl font-bold tracking-tight">Joey.ai</span>
        </div>
        <nav aria-label="Main navigation" className="flex items-center gap-4">
          <a
            href="https://github.com/evonera/joey"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Joey on GitHub"
            className="hidden sm:inline-flex items-center transition-opacity hover:opacity-80"
          >
            <img
              src="https://img.shields.io/github/stars/evonera/joey?style=social&label=Star"
              alt="GitHub star count for evonera/joey"
              width={90}
              height={20}
              loading="lazy"
            />
          </a>
          <Link href="/login" className="text-sm font-medium hover:text-indigo-600 transition-colors">Log in</Link>
          <Link href="/signup" className="text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-full hover:opacity-90 transition-opacity">
            Get Started
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center text-center px-6 pt-32 pb-24">
        <div className="max-w-4xl space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-medium mb-4">
            <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse"></span>
            Meet your new social media manager
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-balance">
            Autonomous Social Media, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500">Solved.</span>
          </h1>
          <p className="text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto text-balance">
            Joey analyzes your brand voice, curates content, and drafts high-performing social posts on autopilot. You just click approve.
          </p>
          <div className="flex items-center justify-center gap-4 pt-8">
            <Link href="/signup" className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-full text-lg font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20">
              Start Automating <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>

        {/* What is Joey */}
        <section className="max-w-3xl w-full mt-32 text-left">
          <h2 className="text-3xl font-bold tracking-tight mb-4">What is Joey?</h2>
          <p className="text-zinc-600 dark:text-zinc-400 text-lg leading-relaxed">
            Joey is an open-source, BYOK (bring your own key) AI social media agent that takes the busywork out of content creation. It connects to your social accounts via Zernio, learns your brand voice and posting preferences, and autonomously drafts platform-optimized posts based on your schedule. Every draft goes through a human-in-the-loop approval process, meaning nothing publishes without your explicit say-so. Built on the Eve agent framework with Next.js, Joey is designed for content creators, small businesses, and marketing teams who want consistent social media presence without the daily time sink.
          </p>
        </section>

        {/* How it Works */}
        <section className="max-w-4xl w-full mt-20">
          <h2 className="text-3xl font-bold tracking-tight text-center mb-12">How Joey Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="h-14 w-14 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">1</div>
              <h3 className="text-lg font-bold mb-2">Connect & Configure</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">Link your social accounts, set your brand voice, and define your posting schedule. All done in minutes.</p>
            </div>
            <div className="text-center">
              <div className="h-14 w-14 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">2</div>
              <h3 className="text-lg font-bold mb-2">AI Drafts Content</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">The Eve-powered agent generates platform-specific posts that match your brand voice and posting goals.</p>
            </div>
            <div className="text-center">
              <div className="h-14 w-14 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">3</div>
              <h3 className="text-lg font-bold mb-2">Review & Approve</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">Nothing goes live without you. Review, edit, or reject drafts. Approved posts publish automatically on schedule.</p>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="w-full mt-20">
          <h2 className="text-3xl font-bold tracking-tight text-center mb-12">Everything you need to manage social media with AI</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl w-full text-left">

            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border shadow-sm">
              <img
                src="/screenshots/composer.svg"
                alt="Joey's AI composer drafting a platform-specific social post from your brand voice settings"
                className="w-full h-40 object-cover object-top rounded-xl border mb-6"
                loading="lazy"
                width={1200}
                height={750}
              />
              <div className="h-12 w-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mb-6">
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Eve-Powered AI</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">Built on the Eve framework, Joey uses advanced agentic workflows to understand social media context, platform formatting constraints, and your unique brand persona. It learns from your past content and posting preferences to generate drafts that sound like you, not a generic chatbot.</p>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border shadow-sm">
              <img
                src="/screenshots/approval.svg"
                alt="Approval dashboard showing pending drafts with one-click approve and reject buttons"
                className="w-full h-40 object-cover object-top rounded-xl border mb-6"
                loading="lazy"
                width={1200}
                height={750}
              />
              <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center mb-6">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Human in the Loop</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">Nothing goes live without your explicit approval. Joey sends every generated draft to your review dashboard, where you can approve, edit, or reject each post before it reaches your audience. You stay in full control of your brand's voice and messaging at all times.</p>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border shadow-sm">
              <img
                src="/screenshots/calendar.svg"
                alt="Content calendar with color-coded scheduled posts across days of the month"
                className="w-full h-40 object-cover object-top rounded-xl border mb-6"
                loading="lazy"
                width={1200}
                height={750}
              />
              <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mb-6">
                <CalendarDays className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Smart Scheduling</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">Visual content calendar with drag-and-drop support makes scheduling effortless. Joey analyzes your posting history and intelligently spaces drafts across your optimal posting times. You can reschedule, queue, or batch-approve posts directly from the calendar view.</p>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border shadow-sm">
              <img
                src="/screenshots/dashboard.svg"
                alt="Joey dashboard with engagement charts, draft queue, and cross-platform performance stats"
                className="w-full h-40 object-cover object-top rounded-xl border mb-6"
                loading="lazy"
                width={1200}
                height={750}
              />
              <div className="h-12 w-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center mb-6">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Cross-Platform Sync</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm">Powered by the Zernio SDK, Joey publishes to Twitter/X, LinkedIn, and Facebook simultaneously from a single dashboard. Each post is formatted per-platform automatically — tailored character counts, link previews, and media attachments — so you maintain consistency across channels.</p>
            </div>

          </div>
        </section>

        {/* Open Source */}
        <section className="max-w-3xl w-full mt-20 bg-white dark:bg-zinc-900 p-8 rounded-2xl border shadow-sm text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <GithubIcon className="h-6 w-6" />
            <h2 className="text-2xl font-bold">Open Source. MIT Licensed.</h2>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">
            Joey is fully open source under the MIT license. Self-host or contribute on GitHub. No vendor lock-in, no hidden fees.
          </p>
          <div className="flex items-center justify-center gap-3 mb-6">
            <a
              href="https://github.com/evonera/joey/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Joey is licensed under MIT"
              className="inline-flex transition-opacity hover:opacity-80"
            >
              <img
                src="https://img.shields.io/badge/License-MIT-blue.svg"
                alt="MIT License"
                width={84}
                height={20}
                loading="lazy"
              />
            </a>
          </div>
          <Link
            href="https://github.com/evonera/joey"
            className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
          >
            View on GitHub <ExternalLink className="h-4 w-4" />
          </Link>
        </section>

        {/* Blog */}
        <section className="max-w-4xl w-full mt-20 text-left">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-3xl font-bold tracking-tight">From the blog</h2>
            <Link href="/blog" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {blogTeasers.map((post) => (
              <Link
                key={post.href}
                href={post.href}
                className="rounded-2xl border bg-white dark:bg-zinc-900 p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <h3 className="font-bold mb-2 leading-snug">{post.title}</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">{post.description}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl w-full mt-20">
          <h2 className="text-3xl font-bold tracking-tight text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-6 text-left">
            <div>
              <h3 className="text-lg font-bold mb-1">Is Joey really open source?</h3>
              <p className="text-zinc-500 dark:text-zinc-400">Yes. Joey is open source under the MIT license. You can self-host the entire platform, audit the code, or contribute on GitHub.</p>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-1">What social platforms does Joey support?</h3>
              <p className="text-zinc-500 dark:text-zinc-400">Joey supports Twitter/X, LinkedIn, and Facebook via the Zernio SDK, with more platforms being added.</p>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-1">How much does Joey cost?</h3>
              <p className="text-zinc-500 dark:text-zinc-400">Joey is free and open source. You bring your own API keys for Zernio and your preferred LLM provider. There are no mandatory subscriptions or hidden fees.</p>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-1">Is my data safe?</h3>
              <p className="text-zinc-500 dark:text-zinc-400">All API keys are encrypted at rest using AES-256-GCM and stored server-side. No keys ever touch your browser. You maintain full control over your social media accounts.</p>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-1">Can I review posts before they go live?</h3>
              <p className="text-zinc-500 dark:text-zinc-400">Absolutely. Human-in-the-loop approval is a core feature. Every post goes to your review dashboard first. You can approve, edit, or reject drafts before anything publishes.</p>
            </div>
          </div>
        </section>

      </main>

      <footer className="border-t py-8 text-center text-zinc-500 text-sm space-y-2">
        <p>
          &copy; {new Date().getFullYear()}{" "}
          <Link href="/about" className="hover:text-indigo-600 transition-colors">
            Evonera
          </Link>
          . All rights reserved.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/privacy" className="hover:text-indigo-600 transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-indigo-600 transition-colors">Terms</Link>
          <Link href="/about" className="hover:text-indigo-600 transition-colors">About</Link>
          <Link href="/blog" className="hover:text-indigo-600 transition-colors">Blog</Link>
          <a href="https://github.com/evonera/joey" target="_blank" rel="noopener noreferrer" aria-label="Joey on GitHub" className="hover:text-indigo-600 transition-colors inline-flex items-center gap-1">
            GitHub <GithubIcon className="h-3 w-3 inline" />
          </a>
          <a href="https://x.com/evonera" target="_blank" rel="noopener noreferrer" aria-label="Evonera on X (Twitter)" className="hover:text-indigo-600 transition-colors">
            X / Twitter
          </a>
        </div>
      </footer>
    </div>
  );
}
