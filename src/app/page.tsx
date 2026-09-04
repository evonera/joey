import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight01Icon as ArrowRight,
  BotIcon as Bot,
  Calendar03Icon as CalendarDays,
  Analytics01Icon as BarChart3,
  SecurityCheckIcon as ShieldCheck,
  LinkSquare01Icon as ExternalLink,
  GitForkIcon,
  SparklesIcon,
  SmartPhone01Icon,
  Comment01Icon,
  Key01Icon,
  CheckmarkCircle02Icon as CheckCircle,
} from "hugeicons-react";
import { JoeyLogo } from "@/components/joey-logo";

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
    description: "What to automate, what to keep human, and how agentic workflows draft high-impact posts.",
  },
  {
    href: "/blog/open-source-social-media-management-joey-vs-buffer-vs-hootsuite",
    title: "Joey vs Buffer vs Hootsuite",
    description: "Open-source AI social media management compared with traditional subscription platforms.",
  },
  {
    href: "/blog/what-is-byok-bring-your-own-key-explained",
    title: "What is BYOK AI?",
    description: "Why bringing your own API keys cuts costs by up to 90% and keeps your data strictly yours.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col font-sans selection:bg-[#ffe633]/30 selection:text-zinc-900">
      {/* Navigation */}
      <header className="sticky top-0 z-50 px-6 py-3.5 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center justify-between max-w-7xl mx-auto w-full">
          <JoeyLogo size="md" />

          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
            <Link href="#flows" className="hover:text-foreground transition-colors">Visual Flows</Link>
            <Link href="#theme-studio" className="hover:text-foreground transition-colors">Theme Studio</Link>
            <Link href="#byok" className="hover:text-foreground transition-colors">BYOK Models</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
          </nav>

          <div className="flex items-center gap-3">
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
            <Link
              href="/login"
              className="text-sm font-medium hover:text-foreground text-muted-foreground transition-colors px-2 py-1"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-medium bg-zinc-900 dark:bg-[#ffe633] text-white dark:text-zinc-950 px-4 py-2 rounded-full hover:opacity-90 transition-opacity shadow-xs"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center text-center px-6 pt-24 pb-20">
        <div className="max-w-4xl space-y-7">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#ffe633]/15 border border-[#ffe633]/30 text-amber-900 dark:text-amber-300 text-xs sm:text-sm font-medium">
            <span className="flex h-2 w-2 rounded-full bg-[#ffe633] animate-pulse" />
            Autonomous Social Media on Your Terms
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-balance">
            Your Autonomous Social Agent.{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-500">
              Powered by Any LLM.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto text-balance leading-relaxed">
            Joey analyzes your brand voice, curates live web intelligence, and crafts multi-platform posts on autopilot. Choose Gemini, GPT, or Claude — you maintain 100% human approval via web or Telegram.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-4">
            <Link
              href="/signup"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-zinc-900 dark:bg-[#ffe633] text-white dark:text-zinc-950 px-8 py-3.5 rounded-full text-base font-semibold hover:opacity-90 transition-all shadow-md"
            >
              Start Automating Free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-background border border-border px-7 py-3.5 rounded-full text-base font-medium text-foreground hover:bg-muted/60 transition-colors"
            >
              Explore Docs & API
            </Link>
          </div>

          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="size-4 text-emerald-500" />
              <span>Open Source (MIT)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="size-4 text-emerald-500" />
              <span>BYOK AI (Zero Markup)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="size-4 text-emerald-500" />
              <span>100% Human Approval Gate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="size-4 text-emerald-500" />
              <span>1-Tap Telegram Approvals</span>
            </div>
          </div>
        </div>

        {/* Hero Interactive App Mockup */}
        <div className="max-w-5xl w-full mt-14 rounded-2xl border border-border/80 bg-background/50 p-2 shadow-2xl backdrop-blur-md">
          <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden text-left">
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 bg-muted/40">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-red-500/80 inline-block" />
                <span className="size-3 rounded-full bg-yellow-500/80 inline-block" />
                <span className="size-3 rounded-full bg-green-500/80 inline-block" />
                <span className="text-xs font-mono text-muted-foreground ml-2">joey.ai/dashboard</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span>Agent Active • Gemini 2.5 Flash</span>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-4">
                <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-lg bg-[#ffe633]/20 flex items-center justify-center p-1">
                        <Image src="/joey-mascot.png" alt="Joey" width={20} height={20} />
                      </div>
                      <span className="font-semibold text-sm">Joey Agent</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">Auto-Drafted</span>
                    </div>
                    <span className="text-xs text-muted-foreground">2 mins ago</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">
                    &ldquo;Most AI tools promise speed. The best ones deliver leverage. By combining node-based web search flows with human-in-the-loop review, your brand voice never compromises.&rdquo;
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <button className="text-xs px-3 py-1.5 rounded-md bg-[#ffe633] text-zinc-950 font-semibold shadow-xs">
                      ✓ Approve Draft
                    </button>
                    <button className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted">
                      Edit
                    </button>
                    <span className="text-[11px] text-muted-foreground ml-auto">Scheduled: Tomorrow 9:00 AM • Twitter/X</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Composer Toolbar</span>
                    <span className="text-emerald-500 font-medium">Model: Gemini 2.5 Flash (Recommended ⚡)</span>
                  </div>
                  <div className="h-9 rounded-md border border-border/50 bg-background/60 px-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Ask Joey: &ldquo;Run my competitor monitoring flow and summarize findings into 3 post angles…&rdquo;</span>
                    <span className="px-2 py-0.5 rounded bg-muted text-[10px] font-mono">⌘ + ↵</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Pipelines</span>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                      <div className="flex items-center gap-2">
                        <GitForkIcon className="size-3.5 text-amber-500" />
                        <span className="font-medium">Tech News Curator</span>
                      </div>
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                      <div className="flex items-center gap-2">
                        <SparklesIcon className="size-3.5 text-indigo-500" />
                        <span className="font-medium">Visual Card Generator</span>
                      </div>
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                      <div className="flex items-center gap-2">
                        <SmartPhone01Icon className="size-3.5 text-blue-500" />
                        <span className="font-medium">Telegram Bot Review</span>
                      </div>
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supported Models</span>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] px-2 py-1 rounded bg-muted font-medium">Gemini 2.5 Flash</span>
                    <span className="text-[10px] px-2 py-1 rounded bg-muted font-medium">Gemini 3.8 Flash</span>
                    <span className="text-[10px] px-2 py-1 rounded bg-muted font-medium">GPT-5.6 Luna</span>
                    <span className="text-[10px] px-2 py-1 rounded bg-muted font-medium">Claude Haiku 4.5</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Flagship Features Section */}
        <section id="features" className="max-w-6xl w-full mt-28 text-left">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Engineered for Real Leverage
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base">
              Everything modern social creators, founders, and marketing teams need to maintain a continuous, high-signal presence without manual grunt work.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1: Visual Flows */}
            <div id="flows" className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="size-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <GitForkIcon className="size-5" />
                </div>
                <h3 className="text-xl font-bold">Visual Flows Studio</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Build automated node-based pipelines. Ingest live industry news via Exa AI semantic search or RSS feeds, filter through customized LLM synthesis, and automatically queue platform-formatted drafts for review.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/40 text-xs font-medium text-amber-600 dark:text-amber-400">
                Node Pipelines • Exa AI • RSS Crawling
              </div>
            </div>

            {/* Feature 2: Theme Studio */}
            <div id="theme-studio" className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="size-11 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <SparklesIcon className="size-5" />
                </div>
                <h3 className="text-xl font-bold">Theme Studio & Visual Cards</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Design bespoke visual templates and multi-slide carousels rendered via SVG. Joey pairs generated copy with branded graphics, typography, and color palettes for maximum feed engagement.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/40 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                SVG Engine • Carousels • Custom Themes
              </div>
            </div>

            {/* Feature 3: BYOK AI */}
            <div id="byok" className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="size-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Key01Icon className="size-5" />
                </div>
                <h3 className="text-xl font-bold">BYOK Multi-Model Chat</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Bring your own API key for Google Gemini, OpenAI, or Anthropic. Switch seamlessly between cheap fast workhorses (Gemini 2.5 Flash, GPT-5.6 Luna) and frontier reasoning models with zero subscription markup.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/40 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                AES-256-GCM • Google/OpenAI/Claude • No Markup
              </div>
            </div>

            {/* Feature 4: Telegram Mobile Approvals */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="size-11 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <SmartPhone01Icon className="size-5" />
                </div>
                <h3 className="text-xl font-bold">1-Tap Telegram Approvals</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Review generated drafts without opening your laptop. Joey sends push alerts to your Telegram chat with full post previews, media, and interactive Approve/Edit/Reject buttons.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/40 text-xs font-medium text-blue-600 dark:text-blue-400">
                Telegram Bot • Instant Alerts • Mobile Review
              </div>
            </div>

            {/* Feature 5: Unified Engagement Inbox */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="size-11 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Comment01Icon className="size-5" />
                </div>
                <h3 className="text-xl font-bold">Unified Engagement Inbox</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Aggregate comments, replies, and direct messages across Twitter/X, LinkedIn, and Facebook in one unified inbox. Joey drafts context-aware responses matching your voice for instant review.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/40 text-xs font-medium text-purple-600 dark:text-purple-400">
                Unified Queue • Smart Replies • Sentiment Analysis
              </div>
            </div>

            {/* Feature 6: Human-in-the-Loop Safeguards */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div className="size-11 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <ShieldCheck className="size-5" />
                </div>
                <h3 className="text-xl font-bold">Strict Human-in-the-Loop</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Nothing publishes to your social profiles without explicit approval. Monotonic versioning, SSRF protections, and atomic Postgres claims protect your brand from rogue posts or runaway automations.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/40 text-xs font-medium text-rose-600 dark:text-rose-400">
                Fail-Closed • Safe Publishing • Zero Accidents
              </div>
            </div>
          </div>
        </section>

        {/* How Joey Works */}
        <section className="max-w-4xl w-full mt-28 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight mb-12">How Joey Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
              <div className="size-10 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold flex items-center justify-center text-lg">
                1
              </div>
              <h3 className="text-lg font-bold">Connect & Configure</h3>
              <p className="text-sm text-muted-foreground">
                Link social profiles via Zernio, choose your preferred AI model (Gemini, Claude, or GPT), and define your posting schedule.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
              <div className="size-10 rounded-xl bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-lg">
                2
              </div>
              <h3 className="text-lg font-bold">Agent Curates & Drafts</h3>
              <p className="text-sm text-muted-foreground">
                Joey monitors live news, searches Exa, parses your brand guidelines, and drafts platform-optimized posts with matching visuals.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
              <div className="size-10 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-lg">
                3
              </div>
              <h3 className="text-lg font-bold">Approve on Web or Phone</h3>
              <p className="text-sm text-muted-foreground">
                Review drafts in your dashboard or tap Approve directly inside Telegram. Only approved content ever touches your channels.
              </p>
            </div>
          </div>
        </section>

        {/* Open Source Banner */}
        <section className="max-w-3xl w-full mt-28 rounded-2xl border border-border bg-card p-8 text-center shadow-xs">
          <div className="flex items-center justify-center gap-2 mb-4">
            <GithubIcon className="size-6 text-foreground" />
            <h2 className="text-2xl font-bold">Open Source. MIT Licensed.</h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6 leading-relaxed">
            Joey is 100% open source. Self-host on your own infrastructure or run it on Vercel and Neon with zero vendor lock-in and complete control of your data.
          </p>
          <div className="flex items-center justify-center gap-4">
            <a
              href="https://github.com/evonera/joey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold bg-zinc-900 dark:bg-[#ffe633] text-white dark:text-zinc-950 px-5 py-2.5 rounded-full hover:opacity-90 transition-opacity"
            >
              Star on GitHub <ExternalLink className="size-4" />
            </a>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 text-sm font-medium border border-border px-5 py-2.5 rounded-full hover:bg-muted/60 transition-colors"
            >
              Developer Docs
            </Link>
          </div>
        </section>

        {/* From the Blog */}
        <section className="max-w-4xl w-full mt-28 text-left">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-3xl font-extrabold tracking-tight">From the Blog</h2>
            <Link href="/blog" className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline">
              View all articles →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {blogTeasers.map((post) => (
              <Link
                key={post.href}
                href={post.href}
                className="rounded-2xl border border-border bg-card p-6 shadow-xs transition-all hover:shadow-md hover:border-border/80 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <h3 className="font-bold text-base leading-snug">{post.title}</h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">{post.description}</p>
                </div>
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-4 inline-flex items-center gap-1">
                  Read article <ArrowRight className="size-3" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl w-full mt-28 text-left space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-extrabold tracking-tight">Frequently Asked Questions</h2>
            <p className="text-sm text-muted-foreground">Everything you need to know about Joey and BYOK automation.</p>
          </div>

          <div className="space-y-6 pt-4">
            <div className="rounded-xl border border-border/60 bg-card p-5 space-y-1.5">
              <h3 className="font-bold text-base">Is Joey truly open source?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Yes. Joey is licensed under the permissive MIT license. You can inspect every line of code, run it locally, fork it, and deploy it to your own cloud without subscription paywalls.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-5 space-y-1.5">
              <h3 className="font-bold text-base">Which AI models can I use?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You can bring your own key for Google Gemini (including free-tier Gemini 2.5 Flash and frontier 3.8 Flash), OpenAI (GPT-5.6 Luna, GPT-4o Mini, GPT-4o), and Anthropic (Claude Haiku 4.5, Claude 3.5 Sonnet). You pay only standard provider token rates with zero middleman markup.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-5 space-y-1.5">
              <h3 className="font-bold text-base">How do Telegram approvals work?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Joey includes a Telegram Bot integration with a fail-closed user ID allowlist. When an automated Flow or scheduled agent drafts a post, you receive an instant message on Telegram with preview media and action buttons to approve or reject with one tap.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-5 space-y-1.5">
              <h3 className="font-bold text-base">What social platforms are supported?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Joey connects via Zernio to support Twitter/X, LinkedIn (Profiles and Company Pages), Facebook Pages, and Pinterest, with Instagram and Bluesky integrations currently rolling out.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-12 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <JoeyLogo size="sm" />

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <a
              href="https://github.com/evonera/joey"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              GitHub <GithubIcon className="size-3.5 inline" />
            </a>
            <a
              href="https://x.com/evonera"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              X / Twitter
            </a>
          </div>

          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Evonera. MIT Licensed.
          </p>
        </div>
      </footer>
    </div>
  );
}
