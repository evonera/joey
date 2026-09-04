'use client';

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  HelpCircleIcon,
  BotIcon,
  GitForkIcon,
  SparklesIcon,
  SmartPhone01Icon,
  Key01Icon,
  CheckmarkCircle02Icon as CheckCircle,
  ArrowRight01Icon as ArrowRight,
} from "hugeicons-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export function HelpTutorialDialog() {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          title="Help & Tutorial Guide"
          aria-label="Help & Tutorial Guide"
        >
          <HelpCircleIcon className="size-4" />
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-border/60 pb-4 text-left">
          <div className="size-10 rounded-xl bg-[#ffe633]/20 border border-[#ffe633]/40 flex items-center justify-center p-1.5 shadow-xs shrink-0">
            <Image src="/joey-mascot.png" alt="Joey" width={28} height={28} className="object-contain" />
          </div>
          <div>
            <DialogTitle className="text-lg font-bold">Joey Guide &amp; Tutorials</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Learn how to get the most leverage out of Joey&apos;s autonomous social engine.
            </DialogDescription>
          </div>
        </DialogHeader>

        <Tabs defaultValue="workflow" className="w-full mt-2">
          <TabsList className="grid grid-cols-5 w-full h-auto p-1 bg-muted/50">
            <TabsTrigger value="workflow" className="text-xs py-1.5">
              Workflow
            </TabsTrigger>
            <TabsTrigger value="chat" className="text-xs py-1.5">
              Chat &amp; Models
            </TabsTrigger>
            <TabsTrigger value="flows" className="text-xs py-1.5">
              Flows
            </TabsTrigger>
            <TabsTrigger value="theme-studio" className="text-xs py-1.5">
              Theme Studio
            </TabsTrigger>
            <TabsTrigger value="telegram" className="text-xs py-1.5">
              Telegram
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Autonomous Workflow */}
          <TabsContent value="workflow" className="space-y-4 pt-3 text-sm">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
              <span className="font-semibold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">
                The 4-Step Autonomous Engine
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Joey is built around a strict <strong>Human-in-the-Loop</strong> architecture. You define your cadence and tone — Joey does the research and drafting, and you approve with one tap.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-border/60 p-3 space-y-1">
                <span className="font-semibold text-foreground">1. Research &amp; Ingestion</span>
                <p className="text-muted-foreground">Joey scans Exa AI and RSS feeds based on your niche topics.</p>
              </div>
              <div className="rounded-lg border border-border/60 p-3 space-y-1">
                <span className="font-semibold text-foreground">2. Brand Voice Drafting</span>
                <p className="text-muted-foreground">Agent crafts platform-optimized posts formatted for Twitter, LinkedIn, and Facebook.</p>
              </div>
              <div className="rounded-lg border border-border/60 p-3 space-y-1">
                <span className="font-semibold text-foreground">3. 1-Click Human Review</span>
                <p className="text-muted-foreground">Approve, edit, or reject directly in your Drafts dashboard or via Telegram.</p>
              </div>
              <div className="rounded-lg border border-border/60 p-3 space-y-1">
                <span className="font-semibold text-foreground">4. Automated Publishing</span>
                <p className="text-muted-foreground">Approved posts are dispatched via Zernio exactly on your schedule.</p>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: Chat & Models */}
          <TabsContent value="chat" className="space-y-4 pt-3 text-sm">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-xs text-indigo-600 dark:text-indigo-400">
                <BotIcon className="size-4" /> Multi-Model BYOK Chat
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Joey doesn&apos;t lock you into a single proprietary LLM. Use the model selector dropdown in the bottom toolbar of the Dashboard chat to switch providers on the fly.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg border border-border/60 space-y-1">
                <span className="font-semibold text-foreground">⚡ Gemini 2.5 Flash &amp; 3.8 Flash (Recommended)</span>
                <p className="text-muted-foreground">Ultra-fast, thinking capable, and free-tier eligible on Google AI Studio.</p>
              </div>
              <div className="p-3 rounded-lg border border-border/60 space-y-1">
                <span className="font-semibold text-foreground">⚡ GPT-5.6 Luna &amp; GPT-4o Mini</span>
                <p className="text-muted-foreground">Cost-efficient OpenAI workhorses for high-volume content operations.</p>
              </div>
              <div className="p-3 rounded-lg border border-border/60 space-y-1">
                <span className="font-semibold text-foreground">⚡ Claude Haiku 4.5 &amp; Sonnet</span>
                <p className="text-muted-foreground">Exceptional tone modulation and creative thought-leadership posts.</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Add your API keys in <strong>Settings → API Keys</strong>. All keys are encrypted at rest with AES-256-GCM.
            </p>
          </TabsContent>

          {/* TAB 3: Visual Flows */}
          <TabsContent value="flows" className="space-y-4 pt-3 text-sm">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-xs text-amber-600 dark:text-amber-400">
                <GitForkIcon className="size-4" /> Node-Based Visual Pipelines
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Flows let you turn recurring tasks into background automations. Go to <strong>Flows</strong> in the sidebar to build or customize a workflow.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg border border-border/60">
                <strong>Schedule &amp; Webhook Triggers:</strong> Run hourly, daily, or on external incoming webhooks.
              </div>
              <div className="p-2.5 rounded-lg border border-border/60">
                <strong>Exa AI Search Nodes:</strong> Semantically search the live web for trending competitor news and research.
              </div>
              <div className="p-2.5 rounded-lg border border-border/60">
                <strong>Draft Action Nodes:</strong> Convert raw research into formatted draft posts queued for approval.
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/flows/templates"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
              >
                Browse Starter Flow Templates →
              </Link>
            </div>
          </TabsContent>

          {/* TAB 4: Theme Studio */}
          <TabsContent value="theme-studio" className="space-y-4 pt-3 text-sm">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-xs text-purple-600 dark:text-purple-400">
                <SparklesIcon className="size-4" /> Dynamic SVG Social Cards
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Theme Studio pairs generated copy with beautiful visual templates. Never post plain text again.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg border border-border/60">
                <strong>Brand Typography &amp; Palettes:</strong> Define your primary colors, fonts, and dark mode variations.
              </div>
              <div className="p-2.5 rounded-lg border border-border/60">
                <strong>Multi-Slide Carousels:</strong> Generate Instagram &amp; LinkedIn carousel slides with sequential cards.
              </div>
              <div className="p-2.5 rounded-lg border border-border/60">
                <strong>SVG Vector Rendering:</strong> Ultra-crisp visuals rendered natively via Resvg.
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/theme-studio"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-1"
              >
                Open Theme Studio →
              </Link>
            </div>
          </TabsContent>

          {/* TAB 5: Telegram Approvals */}
          <TabsContent value="telegram" className="space-y-4 pt-3 text-sm">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-xs text-blue-600 dark:text-blue-400">
                <SmartPhone01Icon className="size-4" /> Mobile Alerts &amp; Instant Review
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connect the Joey Telegram Bot to review scheduled posts from your phone lock screen without opening the web dashboard.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg border border-border/60">
                <strong>1. Link Bot:</strong> Add your bot token in Settings → Integrations.
              </div>
              <div className="p-2.5 rounded-lg border border-border/60">
                <strong>2. Fail-Closed Allowlist:</strong> Only authorized user IDs can trigger actions or receive alerts.
              </div>
              <div className="p-2.5 rounded-lg border border-border/60">
                <strong>3. Interactive Buttons:</strong> Tap [Approve &amp; Publish], [Edit], or [Reject] with instant feedback.
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between">
          <Link
            href="/onboarding"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
          >
            Relaunch Full Onboarding Walkthrough <ArrowRight className="size-3" />
          </Link>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(false)}
            className="text-xs cursor-pointer"
          >
            Close Guide
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
