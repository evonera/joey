"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  IconSparkles, 
  IconCheck, 
  IconArrowRight, 
  IconArrowLeft, 
  IconPlus, 
  IconTrash, 
  IconLoader2,
  IconBrandInstagram,
  IconBrandX,
  IconBrandTiktok,
  IconBrandYoutube,
  IconBrandFacebook,
  IconBrandLinkedin,
  IconBrandReddit,
  IconWorld,
  IconNews,
  IconFlame,
  IconShare
} from "@tabler/icons-react";
import { createThemePage, deleteThemePage } from "@/app/actions/theme-pages";
import { createThemeSource } from "@/app/actions/theme-sources";
import { createThemeSlot } from "@/app/actions/theme-slots";
import { createThemeTemplate } from "@/app/actions/theme-templates";
import { toast } from "sonner";

interface FormatItem {
  id: string;
  slug: string;
  name: string;
  mediaType: string;
  aspectRatio?: string | null;
}

export interface ConnectedAccountItem {
  id: string;
  platform: string;
  accountName?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean | null;
}

interface ThemePageWizardProps {
  availableFormats: FormatItem[];
  initialAccounts?: ConnectedAccountItem[];
}

const MIX_PRESETS = [
  {
    id: "growth",
    title: "Growth Mix ⭐",
    desc: "2 News Cards + 1 Carousel",
    sub: "A varied, production-ready mix for reach, saves, and shares",
  },
  {
    id: "authority",
    title: "Authority Mix",
    desc: "2 Carousels Daily",
    sub: "Best for high saves, shares, and educational authority",
  },
  {
    id: "news",
    title: "News Digest",
    desc: "2 Breaking News Cards",
    sub: "Best for fast turnaround sports and tech curation",
  },
] as const;

function getPlatformIcon(platform: string) {
  const p = platform.toLowerCase();
  if (p === "instagram") return <IconBrandInstagram className="w-4 h-4 text-rose-500" />;
  if (p === "x" || p === "twitter") return <IconBrandX className="w-4 h-4 text-foreground" />;
  if (p === "tiktok") return <IconBrandTiktok className="w-4 h-4 text-pink-500" />;
  if (p === "youtube") return <IconBrandYoutube className="w-4 h-4 text-red-500" />;
  if (p === "facebook") return <IconBrandFacebook className="w-4 h-4 text-blue-600" />;
  if (p === "linkedin") return <IconBrandLinkedin className="w-4 h-4 text-sky-600" />;
  return <IconShare className="w-4 h-4 text-muted-foreground" />;
}

export function ThemePageWizard({ availableFormats, initialAccounts = [] }: ThemePageWizardProps) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [loading, setLoading] = React.useState(false);

  // Step 1: Niche & Voice
  const [name, setName] = React.useState("");
  const [niche, setNiche] = React.useState("");
  const [audience, setAudience] = React.useState("");
  const [voice, setVoice] = React.useState("Authoritative, concise, punchy with viral curiosity hooks");

  // Step 2: Publishing Channels (Social Accounts)
  const [selectedAccountIds, setSelectedAccountIds] = React.useState<string[]>([]);

  // Step 3: Initial Sources
  const [sources, setSources] = React.useState<Array<{ name: string; url: string; type: "rss" | "reddit" | "http" | "exa_domain" | "exa_topic" }>>([
    { name: "Cricinfo & Sports News", url: "espncricinfo.com", type: "exa_domain" },
  ]);

  // Step 4: Mix Preset
  const [selectedPreset, setSelectedPreset] = React.useState<"growth" | "authority" | "news">("growth");

  // Step 5: Brand Kit (Pubity-style default)
  const [primaryColor, setPrimaryColor] = React.useState("#0a0908");
  const [accentColor, setAccentColor] = React.useState("#ffe633");
  const [watermark, setWatermark] = React.useState("@YourHandle");
  const [brandInitial, setBrandInitial] = React.useState("🅟");
  const [topBadge, setTopBadge] = React.useState<"yellow_logo" | "swipe_pill" | "tag_pill" | "none">("yellow_logo");
  const [showDivider, setShowDivider] = React.useState(true);

  function addSourceField() {
    setSources((prev) => [
      ...prev, 
      { name: `Source #${prev.length + 1}`, url: "", type: "exa_domain" }
    ]);
  }

  function removeSourceField(idx: number) {
    setSources((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateSourceField(idx: number, field: string, val: string) {
    setSources((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s))
    );
  }

  function applyPubityDefaults() {
    setPrimaryColor("#0a0908");
    setAccentColor("#ffe633");
    setBrandInitial("🅟");
    setTopBadge("yellow_logo");
    setShowDivider(true);
    toast.success("Applied Pubity editorial theme preset");
  }

  async function handleFinish() {
    if (!name.trim()) {
      toast.error("Please provide a name for your theme page");
      setStep(1);
      return;
    }

    setLoading(true);
    let createdPageId: string | undefined;
    try {
      // 1. Create Theme Page
      const pageRes = await createThemePage({
        name: name.trim(),
        niche: niche.trim() || undefined,
        audience: audience.trim() || undefined,
        voice: voice.trim() || undefined,
        connectedAccounts: selectedAccountIds,
        brandKit: {
          primaryColor,
          accentColor,
          watermark,
          brandInitial,
          topBadge,
          showDivider,
        },
      });

      if (pageRes.error || !pageRes.page) {
        throw new Error(pageRes.error || "Failed to create theme page");
      }

      const pageId = pageRes.page.id;
      createdPageId = pageId;

      const requireSuccess = (result: { error?: string }, operation: string) => {
        if (result.error) throw new Error(`${operation}: ${result.error}`);
      };

      // 2. Add Sources
      for (const src of sources) {
        if (src.url.trim()) {
          const result = await createThemeSource({
            themePageId: pageId,
            name: src.name.trim() || "Source Feed",
            sourceType: src.type,
            url: src.url.trim(),
            rightsCategory: "unknown",
          });
          requireSuccess(result, `Could not add source "${src.name || src.url}"`);
        }
      }

      // 3. Add Slots based on preset
      const productionFormats = availableFormats.filter((format) => format.mediaType !== "video");
      const squareCard = productionFormats.find((f) => f.slug === "instagram-card-1080") || productionFormats[0];
      const carousel = productionFormats.find((f) => f.slug === "instagram-carousel-1080") || productionFormats[0];
      if (!squareCard || !carousel) throw new Error("Theme Studio has no production-ready image formats configured");
      
      if (selectedPreset === "growth") {
        if (squareCard) requireSuccess(await createThemeSlot({ themePageId: pageId, formatId: squareCard.id, label: "Daily News Card", priority: 0 }), "Could not add Daily News Card slot");
        if (carousel) requireSuccess(await createThemeSlot({ themePageId: pageId, formatId: carousel.id, label: "5-Slide Deep Dive Carousel", priority: 1 }), "Could not add carousel slot");
        if (squareCard) requireSuccess(await createThemeSlot({ themePageId: pageId, formatId: squareCard.id, label: "Evening News Card", priority: 2 }), "Could not add Evening News Card slot");
      } else if (selectedPreset === "authority") {
        if (carousel) requireSuccess(await createThemeSlot({ themePageId: pageId, formatId: carousel.id, label: "Morning Carousel Playbook", priority: 0 }), "Could not add morning carousel slot");
        if (carousel) requireSuccess(await createThemeSlot({ themePageId: pageId, formatId: carousel.id, label: "Evening Strategy Breakdown", priority: 1 }), "Could not add evening carousel slot");
      } else {
        if (squareCard) requireSuccess(await createThemeSlot({ themePageId: pageId, formatId: squareCard.id, label: "Morning Flash News", priority: 0 }), "Could not add morning news slot");
        if (squareCard) requireSuccess(await createThemeSlot({ themePageId: pageId, formatId: squareCard.id, label: "Evening Recap Card", priority: 1 }), "Could not add evening news slot");
      }

      // 4. Create Default Pubity-Style Visual Template
      if (squareCard) {
        const result = await createThemeTemplate({
          themePageId: pageId,
          name: `${name} Pubity News Template`,
          formatId: squareCard.id,
          renderer: "puppeteer",
          componentSpec: {
            backgroundColor: primaryColor,
            accentColor: accentColor,
            textColor: "#ffffff",
            watermarkText: watermark,
            brandInitial,
            topBadge,
            showDivider,
            titleTemplate: "{{title}}",
            bodyTemplate: "{{summary}}",
          },
        });
        requireSuccess(result, "Could not create the default visual template");
      }

      toast.success("Theme page created successfully!");
      router.push(`/theme-studio/${pageId}`);
    } catch (err: any) {
      if (createdPageId) await deleteThemePage(createdPageId);
      toast.error(err.message || "Failed to create theme page");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8 border rounded-3xl bg-card shadow-xl space-y-8">
      {/* Step Indicators */}
      <div className="flex items-center justify-between border-b pb-6">
        {[
          { num: 1, label: "Niche & Voice" },
          { num: 2, label: "Channels" },
          { num: 3, label: "Sources" },
          { num: 4, label: "Content Mix" },
          { num: 5, label: "Brand Kit" },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s.num
                  ? "bg-primary text-primary-foreground"
                  : step > s.num
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step > s.num ? <IconCheck className="w-4 h-4" /> : s.num}
            </span>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                step === s.num ? "text-foreground font-semibold" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Niche & Voice */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">Define Your Theme Page Niche</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Give your page an identity, target audience, and editorial voice.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Page Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (watermark === "@YourHandle" && e.target.value.trim()) {
                    setWatermark(`@${e.target.value.replace(/[^a-zA-Z0-9_]/g, "")}`);
                  }
                }}
                placeholder="e.g. Cricket World Daily or Pubity Style Hub"
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Specific Niche</label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. Cricket news, match stats, viral sporting moments"
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Target Audience</label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Sports enthusiasts who want fast visual news in their feed"
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tone & Voice Guide</label>
              <textarea
                rows={2}
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border rounded-xl bg-background"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Publishing Channels */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">Select Publishing Accounts</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Connect the social media accounts that belong to this theme page. You can select multiple accounts (e.g. Instagram + X).
            </p>
          </div>

          {initialAccounts.length === 0 ? (
            <div className="p-6 border border-dashed rounded-2xl text-center space-y-3 bg-muted/20">
              <IconShare className="w-8 h-8 mx-auto text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">No Connected Social Accounts</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  You haven&apos;t connected any accounts in Zernio yet. You can continue creating your theme page now — content will be drafted and saved to your Drafts queue until you connect your accounts.
                </p>
              </div>
              <Link
                href="/accounts"
                target="_blank"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                Connect Accounts in New Tab
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Available connected accounts ({initialAccounts.length})</span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedAccountIds.length === initialAccounts.length) {
                      setSelectedAccountIds([]);
                    } else {
                      setSelectedAccountIds(initialAccounts.map((a) => a.id));
                    }
                  }}
                  className="text-primary hover:underline font-medium"
                >
                  {selectedAccountIds.length === initialAccounts.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {initialAccounts.map((account) => {
                  const checked = selectedAccountIds.includes(account.id);
                  return (
                    <label
                      key={account.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors ${
                        checked ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={account.isActive === false}
                        onChange={(e) => {
                          setSelectedAccountIds((current) =>
                            e.target.checked
                              ? [...new Set([...current, account.id])]
                              : current.filter((id) => id !== account.id)
                          );
                        }}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <div className="flex items-center gap-2 min-w-0">
                        {getPlatformIcon(account.platform)}
                        <div className="truncate">
                          <span className="block font-medium truncate">{account.accountName || "Unnamed Account"}</span>
                          <span className="block text-[11px] capitalize text-muted-foreground">{account.platform}</span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Sources */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Connect Trusted Sources</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Where should Joey discover breaking stories? Use domains (e.g. cricinfo.com), Exa topics, or RSS feeds.
              </p>
            </div>
            <button
              type="button"
              onClick={addSourceField}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80"
            >
              <IconPlus className="w-3.5 h-3.5" /> Add Feed
            </button>
          </div>

          <div className="space-y-3">
            {sources.map((src, idx) => (
              <div key={idx} className="p-3.5 border rounded-xl bg-card space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={src.name}
                    onChange={(e) => updateSourceField(idx, "name", e.target.value)}
                    placeholder="Source Label (e.g. Cricinfo Cricket News)"
                    className="text-xs font-semibold bg-transparent border-none focus:outline-none w-1/2"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={src.type}
                      onChange={(e) => updateSourceField(idx, "type", e.target.value)}
                      className="px-2 py-1 text-xs border rounded bg-background"
                    >
                      <option value="exa_domain">🌐 Exa News Domain</option>
                      <option value="exa_topic">🔍 Exa Topic News</option>
                      <option value="rss">📡 RSS Feed</option>
                      <option value="reddit">💬 Reddit</option>
                      <option value="http">🔗 Web Link</option>
                    </select>
                    {sources.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSourceField(idx)}
                        className="text-muted-foreground hover:text-destructive p-1"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={src.url}
                  onChange={(e) => updateSourceField(idx, "url", e.target.value)}
                  placeholder={
                    src.type === "exa_domain" 
                      ? "espncricinfo.com, cricinfo.com, or bbc.com" 
                      : src.type === "exa_topic" 
                      ? "Cricket World Cup 2026 or NBA Trade Rumors"
                      : src.type === "reddit"
                      ? "r/cricket or r/nba"
                      : "https://example.com/feed.xml"
                  }
                  className="w-full px-3 py-1.5 text-xs border rounded-lg bg-background font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  {src.type === "exa_domain" && "⚡ Exa Search searches this domain for recent news articles and extracts high-resolution hero images."}
                  {src.type === "exa_topic" && "⚡ Exa Search finds fresh breaking stories matching this topic across all top news sources."}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Content Mix Presets */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">Select a Daily Content Recipe</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Choose a proven daily publishing mix for high reach and retention.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {MIX_PRESETS.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setSelectedPreset(p.id)}
                aria-pressed={selectedPreset === p.id}
                className={`p-4 border-2 rounded-2xl cursor-pointer text-left transition-all ${
                  selectedPreset === p.id
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-border hover:border-muted-foreground/40 bg-card"
                }`}
              >
                <h3 className="font-bold text-sm">{p.title}</h3>
                <p className="text-xs font-semibold text-primary mt-1">{p.desc}</p>
                <p className="text-[11px] text-muted-foreground mt-2">{p.sub}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 5: Brand Kit */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Brand Style & Visual Identity</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Pubity-inspired high-contrast visual design system.
              </p>
            </div>
            <button
              type="button"
              onClick={applyPubityDefaults}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-xl hover:bg-amber-500/25"
            >
              <IconSparkles className="w-3.5 h-3.5" /> Pubity Preset
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5">Primary Background</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5">Accent Color (Highlight)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5">Brand Mark Initial</label>
              <input
                type="text"
                value={brandInitial}
                maxLength={3}
                onChange={(e) => setBrandInitial(e.target.value)}
                placeholder="e.g. 🅟 or C"
                className="w-full px-3.5 py-2 text-sm border rounded-xl font-bold text-center"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5">Top Badge Style</label>
              <select
                value={topBadge}
                onChange={(e) => setTopBadge(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border rounded-xl bg-background"
              >
                <option value="yellow_logo">Yellow Logo Shield (🅟)</option>
                <option value="swipe_pill">Frosted SWIPE Pill</option>
                <option value="tag_pill">Category Tag Pill</option>
                <option value="none">None</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5">Watermark / Handle</label>
              <input
                type="text"
                value={watermark}
                onChange={(e) => setWatermark(e.target.value)}
                placeholder="@CricketDaily"
                className="w-full px-3.5 py-2 text-sm border rounded-xl font-mono"
              />
            </div>

            <div className="col-span-2 flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="showDivider"
                checked={showDivider}
                onChange={(e) => setShowDivider(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="showDivider" className="text-xs font-medium cursor-pointer">
                Include signature hairline divider with centered mark ({`— ${brandInitial} —`})
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-6 border-t">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border rounded-xl hover:bg-muted"
          >
            <IconArrowLeft className="w-4 h-4" /> Back
          </button>
        ) : (
          <div />
        )}

        {step < 5 ? (
          <button
            type="button"
            onClick={() => {
              if (step === 1 && !name.trim()) {
                toast.error("Please enter a page name");
                return;
              }
              setStep((s) => s + 1);
            }}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90"
          >
            Continue <IconArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinish}
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 shadow-lg disabled:opacity-50"
          >
            {loading ? <IconLoader2 className="w-4 h-4 animate-spin" /> : <IconSparkles className="w-4 h-4" />}
            Create Theme Page
          </button>
        )}
      </div>
    </div>
  );
}
