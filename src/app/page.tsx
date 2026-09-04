import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight01Icon as ArrowRight,
  BotIcon,
  GitForkIcon,
  SparklesIcon,
  SmartPhone01Icon,
  Comment01Icon,
  SecurityCheckIcon as ShieldCheck,
  CheckmarkCircle02Icon as CheckCircle,
  LinkSquare01Icon as ExternalLink,
  CpuIcon,
  Calendar03Icon,
} from "hugeicons-react";
import { LandingHeader } from "@/components/landing-header";
import { JoeyLogo } from "@/components/joey-logo";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

const platforms = [
  "Twitter / X",
  "LinkedIn",
  "Facebook Pages",
  "Pinterest",
  "Instagram",
  "Bluesky",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0908] text-white flex flex-col font-sans selection:bg-[#ffe633]/30 selection:text-white relative overflow-x-hidden">
      {/* Floating Header with Features, Pricing, Resources */}
      <LandingHeader />

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center pt-32 sm:pt-40 pb-20 px-4 sm:px-6">
        <div className="max-w-[1128px] w-full mx-auto flex flex-col items-center text-center">
          {/* Mascot Tag */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] backdrop-blur-md mb-8">
            <div className="size-4 rounded-full bg-[#ffe633]/20 flex items-center justify-center">
              <span className="size-2 rounded-full bg-[#ffe633] animate-pulse" />
            </div>
            <span className="text-xs font-medium text-white/80">
              Meet Joey • Autonomous Social Media on Your Terms
            </span>
          </div>

          {/* Hero Heading */}
          <h1 className="heading-display text-4xl sm:text-6xl md:text-7xl font-semibold tracking-tight text-white max-w-4xl text-balance">
            Autonomous social media. <br className="hidden sm:inline" />
            <span className="text-white/40">Side by side.</span>
          </h1>

          {/* Hero Subtitle */}
          <p className="mt-6 text-sm sm:text-base md:text-lg text-white/60 max-w-2xl text-balance leading-relaxed">
            Joey monitors live industry news, curates breaking research via Exa, and drafts high-impact social posts on autopilot. Bring your own model key — you stay in 100% human control.
          </p>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <Link
              href="/signup"
              className="btn-accent w-full sm:w-auto text-sm px-6 py-3 rounded-lg shadow-lg font-semibold flex items-center justify-center gap-2"
            >
              <span>Start Automating Free</span>
              <ArrowRight className="size-4" />
            </Link>

            <Link
              href="/docs"
              className="btn-ghost w-full sm:w-auto text-sm px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2"
            >
              <span>Explore Docs &amp; API</span>
            </Link>
          </div>

          {/* Supported Platforms ticker */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-medium text-white/40">
            <span className="uppercase tracking-wider text-[11px] text-white/30">Connects to</span>
            {platforms.map((p) => (
              <span key={p} className="hover:text-white/80 transition-colors">
                {p}
              </span>
            ))}
          </div>

          {/* Hero Mockup Showcase with Glowing Backdrop */}
          <div className="mt-14 w-full max-w-[1040px] rounded-2xl p-2 sm:p-4 bg-gradient-to-b from-white/[0.08] to-transparent border border-white/[0.08] relative">
            {/* Glow backdrop behind UI */}
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/20 via-orange-500/15 to-yellow-500/10 blur-3xl -z-10 rounded-2xl" />

            {/* App Window Shell */}
            <div className="w-full rounded-xl bg-[#121110] border border-white/[0.08] shadow-2xl overflow-hidden text-left">
              {/* Window Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#161514]">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-red-500/70 inline-block" />
                  <span className="size-3 rounded-full bg-yellow-500/70 inline-block" />
                  <span className="size-3 rounded-full bg-green-500/70 inline-block" />
                  <span className="text-xs font-mono text-white/40 ml-3">joey.ai / dashboard</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span className="size-2 rounded-full bg-emerald-400" />
                  <span>Agent Active • Gemini 2.5 Flash</span>
                </div>
              </div>

              {/* Window Content */}
              <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
                {/* Left: Chat & Composer */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-6 rounded-md bg-[#ffe633]/20 flex items-center justify-center p-1">
                          <Image src="/joey-mascot.png" alt="Joey" width={18} height={18} />
                        </div>
                        <span className="font-semibold text-xs text-white">Joey Agent</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-medium">
                          Auto-Drafted
                        </span>
                      </div>
                      <span className="text-[11px] text-white/40">3 mins ago</span>
                    </div>

                    <p className="text-xs sm:text-sm text-white/90 leading-relaxed font-normal">
                      &ldquo;AI automation doesn&apos;t mean spamming feeds. The real unlock is combining semantic web search with your authentic tone, then reviewing drafts in 5 seconds from your phone.&rdquo;
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                      <button className="btn-accent text-[11px] py-1 px-3 rounded">
                        ✓ Approve &amp; Schedule
                      </button>
                      <button className="btn-ghost text-[11px] py-1 px-3 rounded">
                        Edit Draft
                      </button>
                      <span className="text-[11px] text-white/40 ml-auto">Twitter/X • 9:00 AM</span>
                    </div>
                  </div>

                  {/* Input bar preview */}
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 flex items-center justify-between text-xs text-white/40">
                    <span>Ask Joey: &ldquo;Find trending AI agent architectures on Hacker News and draft 2 hot takes…&rdquo;</span>
                    <span className="px-2 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono">⌘ ↵</span>
                  </div>
                </div>

                {/* Right: Flow & Status */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                      Active Background Pipelines
                    </span>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                        <div className="flex items-center gap-2">
                          <GitForkIcon className="size-3.5 text-amber-400" />
                          <span className="font-medium text-white/80">Exa Semantic Curator</span>
                        </div>
                        <span className="text-[10px] text-emerald-400">Ticking (4h)</span>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                        <div className="flex items-center gap-2">
                          <SparklesIcon className="size-3.5 text-purple-400" />
                          <span className="font-medium text-white/80">SVG Theme Generator</span>
                        </div>
                        <span className="text-[10px] text-white/40">Ready</span>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                        <div className="flex items-center gap-2">
                          <SmartPhone01Icon className="size-3.5 text-blue-400" />
                          <span className="font-medium text-white/80">Telegram Bot Gate</span>
                        </div>
                        <span className="text-[10px] text-emerald-400">Connected</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Flagship Feature Cards (Matching GetLemonade layout) */}
        {/* ========================================================================= */}
        <section id="features" className="max-w-[1128px] w-full mt-36 text-left">
          <div className="mb-14 space-y-2">
            <h2 className="heading-section text-3xl sm:text-4xl md:text-5xl font-semibold text-white tracking-tight">
              AI-powered features <br />
              <span className="text-white/40">for every workflow.</span>
            </h2>
          </div>

          <div className="space-y-8">
            {/* Feature 1: Visual Flows */}
            <div
              id="flows"
              className="rounded-2xl bg-[#121110] border border-white/[0.08] p-6 sm:p-10 flex flex-col lg:flex-row items-center gap-8 shadow-xl"
            >
              {/* Text Side */}
              <div className="flex-1 space-y-4">
                <h3 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                  Visual Flows
                </h3>
                <p className="text-sm sm:text-base text-white/60 leading-relaxed max-w-md">
                  Construct autonomous node-based pipelines. Ingest breaking news via Exa AI semantic search or RSS feeds, filter with LLM synthesis, and automatically queue platform-formatted drafts for your review.
                </p>
                <div className="pt-2">
                  <Link
                    href="/flows"
                    className="btn-outline-card inline-flex items-center gap-2"
                  >
                    <span>Open Flows Studio</span>
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>

              {/* Image / Graphic Side with Glowing backdrop */}
              <div className="flex-1 w-full relative rounded-xl overflow-hidden border border-white/[0.06] bg-[#161514] p-6">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-orange-500/25 to-yellow-500/10 blur-2xl -z-10" />

                {/* Node Graph Mockup */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-white/40 pb-2 border-b border-white/[0.06]">
                    <span className="font-mono">pipeline.flow.json</span>
                    <span className="text-emerald-400">● Active</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.08] flex-1 text-xs">
                      <div className="text-[10px] text-amber-400 font-semibold uppercase">Trigger</div>
                      <div className="text-white font-medium mt-0.5">Every 4 hours</div>
                    </div>
                    <span className="text-white/20">→</span>
                    <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.08] flex-1 text-xs">
                      <div className="text-[10px] text-blue-400 font-semibold uppercase">Exa Search</div>
                      <div className="text-white font-medium mt-0.5">Industry Trends</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center text-white/20 text-xs">↓</div>

                  <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-purple-400 font-semibold uppercase">Synthesis &amp; Drafting</div>
                      <span className="text-[10px] text-white/40">Gemini 2.5 Flash</span>
                    </div>
                    <div className="text-white font-medium mt-0.5">
                      Extract key architectural insight &amp; create draft
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 2: Theme Studio */}
            <div
              id="theme-studio"
              className="rounded-2xl bg-[#121110] border border-white/[0.08] p-6 sm:p-10 flex flex-col lg:flex-row items-center gap-8 shadow-xl"
            >
              {/* Text Side */}
              <div className="flex-1 space-y-4">
                <h3 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                  Theme Studio
                </h3>
                <p className="text-sm sm:text-base text-white/60 leading-relaxed max-w-md">
                  Design custom visual templates and multi-slide social carousels rendered via SVG. Joey pairs generated copy with branded graphics, fonts, and colors for maximum feed engagement.
                </p>
                <div className="pt-2">
                  <Link
                    href="/theme-studio"
                    className="btn-outline-card inline-flex items-center gap-2"
                  >
                    <span>Open Theme Studio</span>
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>

              {/* Image / Graphic Side with Glowing backdrop */}
              <div className="flex-1 w-full relative rounded-xl overflow-hidden border border-white/[0.06] bg-[#161514] p-6">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-indigo-500/25 to-pink-500/10 blur-2xl -z-10" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-white/40 pb-2 border-b border-white/[0.06]">
                    <span className="font-mono">carousel_slide_01.svg</span>
                    <span className="text-purple-400">Resvg 2x Render</span>
                  </div>

                  <div className="rounded-lg bg-zinc-950 p-4 border border-white/[0.06] space-y-2">
                    <div className="size-6 rounded bg-[#ffe633] text-black font-bold flex items-center justify-center text-[10px]">
                      J
                    </div>
                    <p className="text-sm font-semibold text-white leading-snug">
                      &ldquo;Code that never reaches production is just expensive philosophy.&rdquo;
                    </p>
                    <div className="text-[10px] text-white/40 pt-1 flex items-center justify-between">
                      <span>Brand: Evonera Tech</span>
                      <span>Slide 1 of 4</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 3: BYOK Agent Chat */}
            <div
              id="chat"
              className="rounded-2xl bg-[#121110] border border-white/[0.08] p-6 sm:p-10 flex flex-col lg:flex-row items-center gap-8 shadow-xl"
            >
              {/* Text Side */}
              <div className="flex-1 space-y-4">
                <h3 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                  BYOK Agent Chat
                </h3>
                <p className="text-sm sm:text-base text-white/60 leading-relaxed max-w-md">
                  Bring your own key for Google Gemini (including free-tier Gemini 2.5 Flash), OpenAI GPT-5.6, or Claude Haiku 4.5. Switch models dynamically with zero markup on tokens.
                </p>
                <div className="pt-2">
                  <Link
                    href="/dashboard"
                    className="btn-outline-card inline-flex items-center gap-2"
                  >
                    <span>Launch Chat Agent</span>
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>

              {/* Image / Graphic Side with Glowing backdrop */}
              <div className="flex-1 w-full relative rounded-xl overflow-hidden border border-white/[0.06] bg-[#161514] p-6">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-cyan-500/10 blur-2xl -z-10" />

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between text-white/40 pb-2 border-b border-white/[0.06]">
                    <span className="font-mono">model_selector.tsx</span>
                    <span className="text-emerald-400">AES-256-GCM Encrypted</span>
                  </div>

                  <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] space-y-1">
                    <div className="text-[10px] text-amber-400 font-medium">Selected Provider</div>
                    <div className="text-white font-semibold">Gemini 2.5 Flash (Recommended ⚡)</div>
                    <div className="text-[11px] text-white/40">Free tier eligible • Sub-second drafting</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      GPT-5.6 Luna
                    </div>
                    <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      Claude Haiku 4.5
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 4: Telegram Mobile Approvals */}
            <div
              id="telegram"
              className="rounded-2xl bg-[#121110] border border-white/[0.08] p-6 sm:p-10 flex flex-col lg:flex-row items-center gap-8 shadow-xl"
            >
              {/* Text Side */}
              <div className="flex-1 space-y-4">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-xs font-semibold uppercase tracking-wider">
                  Mobile Workflow
                </div>
                <h3 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                  1-Tap Telegram Approvals
                </h3>
                <p className="text-sm sm:text-base text-white/60 leading-relaxed max-w-md">
                  Never miss an approval. Joey pings your Telegram with full post previews, image carousels, and interactive Approve/Edit/Reject buttons straight on your phone lock screen.
                </p>
                <div className="pt-2">
                  <Link
                    href="/settings"
                    className="btn-outline-card inline-flex items-center gap-2"
                  >
                    <span>Configure Telegram</span>
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>

              {/* Image / Graphic Side with Glowing backdrop */}
              <div className="flex-1 w-full relative rounded-xl overflow-hidden border border-white/[0.06] bg-[#161514] p-6">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-sky-500/25 to-indigo-500/10 blur-2xl -z-10" />

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between text-white/40 pb-2 border-b border-white/[0.06]">
                    <span className="font-mono">telegram_bot_preview</span>
                    <span className="text-blue-400">Instant Alert</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/[0.08] space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-blue-400" />
                      <span className="font-semibold text-white">Joey Dispatch Bot</span>
                    </div>
                    <p className="text-xs text-white/80 leading-relaxed">
                      &ldquo;New draft generated from Exa Trend Digest. Target: LinkedIn &amp; Twitter at 09:00 UTC.&rdquo;
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-center py-1.5 rounded font-semibold text-[11px]">
                        ✓ Approve
                      </div>
                      <div className="bg-white/[0.04] text-white/70 border border-white/[0.08] text-center py-1.5 rounded text-[11px]">
                        Edit
                      </div>
                      <div className="bg-red-500/10 text-red-400 border border-red-500/20 text-center py-1.5 rounded text-[11px]">
                        Reject
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* Supporting Features 6-Card Grid (Matching GetLemonade) */}
        {/* ========================================================================= */}
        <section className="max-w-[1128px] w-full mt-36 text-left">
          <div className="mb-12 space-y-2">
            <h2 className="heading-section text-3xl sm:text-4xl font-semibold text-white tracking-tight">
              Zero compromises. <br />
              <span className="text-white/40">Built for real leverage.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="rounded-xl bg-[#121110] border border-white/[0.08] p-6 space-y-3">
              <div className="size-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <ShieldCheck className="size-4" />
              </div>
              <h4 className="font-semibold text-base text-white">100% Human in the Loop</h4>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                Nothing publishes to your channels without your approval. Monotonic execution locks protect against duplicate dispatches.
              </p>
            </div>

            <div className="rounded-xl bg-[#121110] border border-white/[0.08] p-6 space-y-3">
              <div className="size-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <CpuIcon className="size-4" />
              </div>
              <h4 className="font-semibold text-base text-white">Zero AI Markup (BYOK)</h4>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                Connect your Google, OpenAI, or Anthropic keys directly. You pay only standard provider token costs with 0% extra fees.
              </p>
            </div>

            <div id="inbox" className="rounded-xl bg-[#121110] border border-white/[0.08] p-6 space-y-3">
              <div className="size-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center">
                <Comment01Icon className="size-4" />
              </div>
              <h4 className="font-semibold text-base text-white">Unified Engagement Inbox</h4>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                Triage comments and replies across Twitter, LinkedIn, and Facebook in one queue with brand-tuned AI reply suggestions.
              </p>
            </div>

            <div className="rounded-xl bg-[#121110] border border-white/[0.08] p-6 space-y-3">
              <div className="size-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
                <Calendar03Icon className="size-4" />
              </div>
              <h4 className="font-semibold text-base text-white">Visual Content Calendar</h4>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                Drag-and-drop scheduling across timezones. Preview scheduled drafts in weekly or monthly visual calendars.
              </p>
            </div>

            <div className="rounded-xl bg-[#121110] border border-white/[0.08] p-6 space-y-3">
              <div className="size-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                <SparklesIcon className="size-4" />
              </div>
              <h4 className="font-semibold text-base text-white">High-Res Resvg Export</h4>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                Render multi-slide carousels and SVG cards at 2x retina clarity for crisp viewing on Twitter and LinkedIn.
              </p>
            </div>

            <div className="rounded-xl bg-[#121110] border border-white/[0.08] p-6 space-y-3">
              <div className="size-8 rounded-lg bg-white/[0.08] text-white flex items-center justify-center">
                <GithubIcon className="size-4" />
              </div>
              <h4 className="font-semibold text-base text-white">100% Open Source MIT</h4>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                Self-host on Neon and Vercel or your own server. Inspect the code, fork it, and own your social stack completely.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* Pricing Section (Matching GetLemonade layout) */}
        {/* ========================================================================= */}
        <section id="pricing" className="max-w-[1128px] w-full mt-36 text-left">
          <div className="mb-12 space-y-2">
            <h2 className="heading-section text-3xl sm:text-4xl font-semibold text-white tracking-tight">
              Simple, transparent pricing. <br />
              <span className="text-white/40">No hidden subscription traps.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Plan 1: Open Source BYOK */}
            <div className="rounded-2xl bg-[#121110] border border-white/[0.08] p-8 space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="inline-flex items-center px-2.5 py-0.5 rounded bg-white/[0.06] text-xs font-semibold text-white/80">
                  Open Source &amp; Self-Hosted
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-bold tracking-tight text-white">$0</span>
                  <span className="text-xs text-white/40 uppercase font-mono">/ Forever</span>
                </div>
                <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                  Everything you need to automate your social channels. Bring your own keys and run locally or on your cloud.
                </p>

                <div className="space-y-2.5 pt-2 text-xs text-white/80">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="size-4 text-emerald-400 shrink-0" />
                    <span>Bring your own keys (Google, OpenAI, Claude)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="size-4 text-emerald-400 shrink-0" />
                    <span>Visual Flows Studio &amp; Exa AI integration</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="size-4 text-emerald-400 shrink-0" />
                    <span>Theme Studio &amp; dynamic SVG carousels</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="size-4 text-emerald-400 shrink-0" />
                    <span>Telegram Bot mobile alerts &amp; 1-tap approvals</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="size-4 text-emerald-400 shrink-0" />
                    <span>Full REST API &amp; WebMCP access</span>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <Link
                  href="/signup"
                  className="btn-accent w-full text-center py-2.5 rounded-lg text-xs font-semibold"
                >
                  Start Free Now
                </Link>
              </div>
            </div>

            {/* Plan 2: Hosted Cloud */}
            <div className="rounded-2xl bg-[#121110] border border-amber-500/30 p-8 space-y-6 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 px-3 py-1 bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider rounded-bl-lg">
                Zero Ops
              </div>

              <div className="space-y-4">
                <div className="inline-flex items-center px-2.5 py-0.5 rounded bg-amber-500/15 text-xs font-semibold text-amber-300">
                  Joey Cloud Managed
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-bold tracking-tight text-white">$19</span>
                  <span className="text-xs text-white/40 uppercase font-mono">/ Month</span>
                </div>
                <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                  For creators and teams who want hands-off automated background schedules without managing infrastructure.
                </p>

                <div className="space-y-2.5 pt-2 text-xs text-white/80">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="size-4 text-amber-400 shrink-0" />
                    <span>All Open Source features included</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="size-4 text-amber-400 shrink-0" />
                    <span>Always-on background workers on Neon Lakebase</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="size-4 text-amber-400 shrink-0" />
                    <span>Managed media asset storage &amp; CDN</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="size-4 text-amber-400 shrink-0" />
                    <span>Priority webhook dispatching</span>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <Link
                  href="/signup"
                  className="btn-ghost w-full text-center py-2.5 rounded-lg text-xs font-semibold"
                >
                  Get Started with Cloud
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* Bottom CTA Glow Banner */}
        {/* ========================================================================= */}
        <section className="max-w-[1128px] w-full mt-36 rounded-2xl bg-gradient-to-b from-white/[0.06] to-transparent border border-white/[0.08] p-8 sm:p-14 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-orange-500/15 to-yellow-500/10 blur-3xl -z-10" />

          <div className="size-16 rounded-2xl bg-[#ffe633]/20 border border-[#ffe633]/40 flex items-center justify-center mx-auto p-2.5 mb-6 shadow-md">
            <Image src="/joey-mascot.png" alt="Joey" width={48} height={48} className="object-contain" />
          </div>

          <h3 className="heading-section text-2xl sm:text-4xl font-semibold text-white tracking-tight max-w-xl mx-auto">
            Ready to put your social channels on autopilot?
          </h3>

          <p className="mt-4 text-xs sm:text-sm text-white/60 max-w-md mx-auto leading-relaxed">
            Deploy in under 2 minutes. Bring your own key, connect your channels, and take complete control of your social growth.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className="btn-accent text-sm px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2"
            >
              <span>Get Started Free</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-10 px-6 bg-[#0a0908]">
        <div className="max-w-[1128px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-white/40">
          <JoeyLogo size="sm" />

          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
            <a
              href="https://github.com/evonera/joey"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors inline-flex items-center gap-1"
            >
              GitHub <ExternalLink className="size-3" />
            </a>
          </div>

          <p>&copy; {new Date().getFullYear()} Evonera. MIT Licensed.</p>
        </div>
      </footer>
    </div>
  );
}
