'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Key01Icon,
  CheckmarkCircle02Icon as CheckCircle,
  Loading03Icon as Loader2,
  ArrowRight01Icon as ArrowRight,
  ArrowLeft01Icon as ArrowLeft,
  BotIcon,
  GitForkIcon,
  SparklesIcon,
  SmartPhone01Icon,
  Comment01Icon,
  PaintBoardIcon,
} from "hugeicons-react";
import { saveApiKey } from "@/app/actions/api-keys";
import { saveAgentConfig, getAgentConfig } from "@/app/actions/agent";

type Step = 1 | 2 | 3 | 4 | 5;

const VOICE_PRESETS = [
  {
    id: "bold",
    title: "⚡ Bold & High-Signal",
    description: "Punchy, opinionated, direct. Zero filler, strong hooks.",
    prompt: "Direct, confident, contrarian where justified. Short sentences, data-backed insights, zero fluff.",
  },
  {
    id: "technical",
    title: "🧠 Technical & Deep",
    description: "Architecture breakdown, engineering lessons, code snippets.",
    prompt: "Technical, analytical, precise. Explaining the 'why' and architectural trade-offs behind engineering decisions.",
  },
  {
    id: "founder",
    title: "🚀 Founder & Build-in-Public",
    description: "Authentic founder journey, metrics, honest reflections.",
    prompt: "Transparent, founder-first, conversational. Sharing real numbers, failures, wins, and product lessons.",
  },
  {
    id: "approachable",
    title: "🤝 Friendly & Educational",
    description: "Accessible explanations, warm tone, community-first.",
    prompt: "Warm, engaging, educational. Breaking down complex concepts so any curious reader can understand.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Step 2: AI Provider state
  const [selectedProvider, setSelectedProvider] = useState<"google" | "openai" | "anthropic">("google");
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [savingAiKey, setSavingAiKey] = useState(false);
  const [aiKeySuccess, setAiKeySuccess] = useState(false);

  // Step 3: Brand Voice state
  const [selectedVoice, setSelectedVoice] = useState<string>("bold");
  const [audienceInput, setAudienceInput] = useState("");
  const [savingVoice, setSavingVoice] = useState(false);

  // Step 4: Zernio Social state
  const [zernioKey, setZernioKey] = useState("");
  const [validatingZernio, setValidatingZernio] = useState(false);
  const [zernioError, setZernioError] = useState("");
  const [zernioSuccess, setZernioSuccess] = useState(false);

  const handleSaveAiKey = async () => {
    if (!aiKeyInput.trim()) return;
    setSavingAiKey(true);
    try {
      await saveApiKey(selectedProvider, aiKeyInput.trim());
      setAiKeySuccess(true);
      if (typeof window !== "undefined") {
        if (selectedProvider === "google") localStorage.setItem("joey_preferred_model", "google/gemini-2.5-flash");
        if (selectedProvider === "openai") localStorage.setItem("joey_preferred_model", "openai/gpt-5.6-luna");
        if (selectedProvider === "anthropic") localStorage.setItem("joey_preferred_model", "anthropic/claude-haiku-4.5");
      }
    } catch {
      // Allow proceeding even if key save failed in test/local
    } finally {
      setSavingAiKey(false);
    }
  };

  const handleSaveBrandVoice = async () => {
    setSavingVoice(true);
    try {
      const preset = VOICE_PRESETS.find((v) => v.id === selectedVoice);
      const voiceText = preset ? preset.prompt : "Confident and engaging.";
      const goalsText = audienceInput.trim()
        ? `Target audience: ${audienceInput.trim()}`
        : "Grow audience engagement and provide genuine industry value.";

      const { config } = await getAgentConfig();
      const existingSchedule = config?.postingSchedule || {
        timezone: "UTC",
        activeDays: ["mon", "tue", "wed", "thu", "fri"],
        times: ["09:00", "15:00"],
        selectedAccountIds: [],
      };

      await saveAgentConfig({
        brandVoice: voiceText,
        postingGoals: goalsText,
        postingSchedule: existingSchedule,
      });
    } catch (err) {
      console.warn("Could not save initial agent config:", err);
    } finally {
      setSavingVoice(false);
      setStep(4);
    }
  };

  const handleValidateZernio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zernioKey.trim()) return;
    setValidatingZernio(true);
    setZernioError("");

    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: zernioKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to validate Zernio key");
      setZernioSuccess(true);
      setTimeout(() => setStep(5), 1000);
    } catch (err: any) {
      setZernioError(err.message);
    } finally {
      setValidatingZernio(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 text-zinc-900 dark:text-zinc-50">
      {/* Top Bar with Skip */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl bg-[#ffe633]/20 border border-[#ffe633]/40 flex items-center justify-center p-1.5 shadow-xs">
            <Image src="/joey-mascot.png" alt="Joey" width={22} height={22} className="object-contain" />
          </div>
          <span className="font-bold text-base tracking-tight">Joey Onboarding</span>
        </div>

        <Link
          href="/dashboard"
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip to Dashboard →
        </Link>
      </div>

      {/* Main Card Container */}
      <div className="w-full max-w-2xl rounded-2xl border border-border/80 bg-white dark:bg-zinc-900 p-6 sm:p-10 shadow-lg relative overflow-hidden">
        {/* Step Progress Bar */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setStep(s as Step)}
                className={`size-7 rounded-full text-xs font-semibold flex items-center justify-center transition-all ${
                  step === s
                    ? "bg-zinc-900 text-white dark:bg-[#ffe633] dark:text-zinc-950 scale-105"
                    : s < step
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s < step ? "✓" : s}
              </button>
            ))}
          </div>
          <span className="text-xs font-medium text-muted-foreground">Step {step} of 5</span>
        </div>

        {/* STEP 1: Welcome */}
        {step === 1 && (
          <div className="space-y-6 text-center">
            <div className="size-20 rounded-2xl bg-[#ffe633]/15 border border-[#ffe633]/30 flex items-center justify-center mx-auto p-3 shadow-xs">
              <Image src="/joey-mascot.png" alt="Joey" width={56} height={56} className="object-contain" priority />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome to Joey!</h1>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Meet your autonomous social media agent. Joey monitors live trends, crafts platform-optimized drafts, and generates branded visuals.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">1. Autonomous Drafts</span>
                <p className="text-xs text-muted-foreground">Joey generates content tailored to your schedule & tone.</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1">
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">2. 100% In Control</span>
                <p className="text-xs text-muted-foreground">Nothing publishes without your 1-click human approval.</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-1">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">3. Bring Your Own Key</span>
                <p className="text-xs text-muted-foreground">Zero markup on AI tokens. Encrypted at rest.</p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end">
              <button
                onClick={() => setStep(2)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-zinc-900 text-white dark:bg-[#ffe633] dark:text-zinc-950 font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Let&apos;s Get Started <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Choose AI Engine (BYOK) */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight">Choose Your AI Engine</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Joey connects directly to your preferred model provider. Your keys are encrypted with AES-256-GCM.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSelectedProvider("google")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  selectedProvider === "google"
                    ? "border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 ring-2 ring-amber-500/30"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">Google Gemini</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                    Free Tier ⚡
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Gemini 2.5 Flash & 3.8 Flash. Generous free tier, lightning fast.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedProvider("openai")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  selectedProvider === "openai"
                    ? "border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 ring-2 ring-amber-500/30"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">OpenAI</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">Standard</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  GPT-5.6 Luna & GPT-4o Mini. Solid multimodal workhorse.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedProvider("anthropic")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  selectedProvider === "anthropic"
                    ? "border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 ring-2 ring-amber-500/30"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">Anthropic</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">Nuanced</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Claude Haiku 4.5 & Sonnet. Rich brand voice and human tone.
                </p>
              </button>
            </div>

            <div className="space-y-3 pt-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Enter {selectedProvider.toUpperCase()} API Key (Optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder={
                    selectedProvider === "google"
                      ? "AIzaSy..."
                      : selectedProvider === "openai"
                      ? "sk-..."
                      : "sk-ant-..."
                  }
                  value={aiKeyInput}
                  onChange={(e) => {
                    setAiKeyInput(e.target.value);
                    setAiKeySuccess(false);
                  }}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
                <button
                  type="button"
                  onClick={handleSaveAiKey}
                  disabled={savingAiKey || !aiKeyInput.trim()}
                  className="px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-xs font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {savingAiKey ? "Saving..." : aiKeySuccess ? "Saved ✓" : "Save Key"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                You can also configure this later in <strong>Settings → API Keys</strong>.
              </p>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-2 px-6 py-2 rounded-full bg-zinc-900 text-white dark:bg-[#ffe633] dark:text-zinc-950 font-semibold text-xs hover:opacity-90 transition-opacity"
              >
                Continue <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Brand Voice */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight">Tune Your Brand Voice</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Joey uses this profile to generate posts that sound authentically like you.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {VOICE_PRESETS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVoice(v.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedVoice === v.id
                      ? "border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 ring-2 ring-amber-500/30"
                      : "border-border bg-card hover:bg-muted/40"
                  }`}
                >
                  <span className="font-semibold text-sm block mb-1">{v.title}</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">{v.description}</p>
                </button>
              ))}
            </div>

            <div className="space-y-2 pt-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Who is your target audience? (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Early-stage founders, software engineers, marketing leaders"
                value={audienceInput}
                onChange={(e) => setAudienceInput(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
              <button
                type="button"
                onClick={handleSaveBrandVoice}
                disabled={savingVoice}
                className="flex items-center gap-2 px-6 py-2 rounded-full bg-zinc-900 text-white dark:bg-[#ffe633] dark:text-zinc-950 font-semibold text-xs hover:opacity-90 transition-opacity"
              >
                {savingVoice ? "Saving..." : "Save & Continue"} <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Connect Socials (Zernio) */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight">Connect Social Channels</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Joey connects to Twitter/X, LinkedIn, and Facebook via Zernio. Enter your key or skip to test in sandbox.
              </p>
            </div>

            {zernioSuccess ? (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-center gap-3">
                <CheckCircle className="size-5 text-emerald-500 shrink-0" />
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Zernio key validated successfully! Advancing to tour...
                </p>
              </div>
            ) : (
              <form onSubmit={handleValidateZernio} className="space-y-4">
                {zernioError && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-600 dark:text-red-400">
                    {zernioError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Zernio API Key
                  </label>
                  <input
                    type="password"
                    placeholder="sk_..."
                    value={zernioKey}
                    onChange={(e) => setZernioKey(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Find your key on the{" "}
                    <a
                      href="https://zernio.com/dashboard"
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      Zernio Dashboard
                    </a>
                    .
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={validatingZernio || !zernioKey.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-900 text-white dark:bg-[#ffe633] dark:text-zinc-950 text-xs font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    {validatingZernio ? <Loader2 className="size-3.5 animate-spin" /> : "Validate & Connect"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(5)}
                    className="px-4 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted/60 transition-colors"
                  >
                    Skip for Now
                  </button>
                </div>
              </form>
            )}

            <div className="pt-4 flex items-center justify-between border-t border-border/40">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                I&apos;ll configure social keys later →
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Power Tools Tour */}
        {step === 5 && (
          <div className="space-y-6 text-center">
            <div className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">You&apos;re Ready to Launch! 🚀</h2>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
                Here are the 5 superpowers now at your fingertips in the Joey Dashboard:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-xs text-amber-600 dark:text-amber-400">
                  <BotIcon className="size-4" /> Agent Chat
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Chat with Joey using Gemini, GPT, or Claude to brainstorm, draft, and run flows.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-xs text-indigo-600 dark:text-indigo-400">
                  <GitForkIcon className="size-4" /> Visual Flows Studio
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Automate Exa AI web search & RSS ingestion straight into scheduled drafts.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-xs text-purple-600 dark:text-purple-400">
                  <SparklesIcon className="size-4" /> Theme Studio
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Design SVG quote cards and multi-slide social carousels styled with your brand.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                <div className="flex items-center gap-2 font-semibold text-xs text-blue-600 dark:text-blue-400">
                  <SmartPhone01Icon className="size-4" /> Telegram Bot Approvals
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Receive instant alerts and 1-tap approve scheduled posts directly on Telegram.
                </p>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full sm:w-auto px-8 py-3 rounded-full bg-zinc-900 text-white dark:bg-[#ffe633] dark:text-zinc-950 font-bold text-sm hover:opacity-90 transition-opacity shadow-md"
              >
                Go to Dashboard 🚀
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Tip: You can re-open this guide anytime via the <strong>Help (?)</strong> icon in the dashboard header.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
