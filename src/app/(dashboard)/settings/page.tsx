'use client';

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getAgentConfig, saveAgentConfig } from "@/app/actions/agent";
import { getConnectedAccounts } from "@/app/actions/zernio";
import { getUsage } from "@/app/actions/usage";
import { getApiKey, saveApiKey, deleteApiKey } from "@/app/actions/api-keys";
import { getNotificationPreferences, saveNotificationPreferences } from "@/app/actions/notifications";
import {
  Loading03Icon as Loader2,
  FloppyDiskIcon as Save,
  CheckmarkCircle02Icon as CheckCircle2,
  ChartAverageIcon as TrendingUp,
  Alert02Icon as AlertTriangle,
  SparklesIcon as Sparkles,
  ViewIcon as Eye,
  ViewOffSlashIcon as EyeOff,
  Delete02Icon as Trash2,
  FlashIcon as PlugZap,
  Notification01Icon as Bell,
  UserMultiple02Icon as UserIcon,
  Activity01Icon as KeyIcon,
} from "hugeicons-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConnectionsPanel } from "./connections-panel";
import { ApiTokensPanel } from "./api-tokens-panel";
import { IntegrationsPanel } from "./integrations-panel";
import { TelegramPanel } from "./telegram-panel";
import { toast } from "sonner";

const AI_PROVIDERS = [
  {
    id: "google",
    name: "Google Gemini",
    models: "Gemini 2.5 Flash, 1.5 Pro",
    placeholder: "AIzaSy...",
    docsUrl: "https://aistudio.google.com",
    docsName: "Google AI Studio",
    note: "Stored AES-256-GCM encrypted.",
  },
  {
    id: "openai",
    name: "OpenAI",
    models: "GPT-4o, DALL-E 3",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com",
    docsName: "platform.openai.com",
    note: "Stored AES-256-GCM encrypted.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    models: "Claude 3.7 Sonnet, 3.5 Haiku",
    placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com",
    docsName: "console.anthropic.com",
    note: "Stored AES-256-GCM encrypted.",
  },
  {
    id: "fal",
    name: "fal.ai",
    models: "Flux",
    placeholder: "FAL_KEY",
    docsUrl: "https://fal.ai/dashboard",
    docsName: "fal.ai/dashboard",
    note: "Stored AES-256-GCM encrypted.",
  },
];

const DAYS_OF_WEEK = [
  { id: "mon", label: "Monday" },
  { id: "tue", label: "Tuesday" },
  { id: "wed", label: "Wednesday" },
  { id: "thu", label: "Thursday" },
  { id: "fri", label: "Friday" },
  { id: "sat", label: "Saturday" },
  { id: "sun", label: "Sunday" },
];

function SettingsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "persona";
  const [activeTab, setActiveTab] = useState(initialTab);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const [brandVoice, setBrandVoice] = useState("");
  const [postingGoals, setPostingGoals] = useState("");
  
  const [timezone, setTimezone] = useState("UTC");
  const [activeDays, setActiveDays] = useState<string[]>([]);
  const [timesText, setTimesText] = useState("");
  
  const [accounts, setAccounts] = useState<{ id: string; platform: string; accountName: string | null; avatarUrl?: string | null }[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  const [usageStats, setUsageStats] = useState<{
    inputTokensUsed: number | null;
    outputTokensUsed: number | null;
    estimatedCostUsd: string | null;
    budgetLimitUsd: string | null;
  } | null>(null);
  
  const [apiKeys, setApiKeys] = useState<Record<string, { id: string; provider: string; status: string; maskedKey?: string }>>({});
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<Record<string, boolean>>({});
  const [savedKey, setSavedKey] = useState<Record<string, boolean>>({});

  const [notificationPrefs, setNotificationPrefs] = useState<any>(null);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationsSaved, setNotificationsSaved] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [configRes, accountsRes, usageRes, prefsRes] = await Promise.all([
          getAgentConfig(),
          getConnectedAccounts(),
          getUsage(),
          getNotificationPreferences()
        ]);

        if (usageRes.usage) {
          setUsageStats(usageRes.usage);
        }

        const [openaiKey, anthropicKey, googleKey, falKey] = await Promise.all([
          getApiKey("openai"),
          getApiKey("anthropic"),
          getApiKey("google"),
          getApiKey("fal"),
        ]);
        const keyMap: Record<string, { id: string; provider: string; status: string; maskedKey?: string }> = {};
        if (openaiKey) keyMap["openai"] = openaiKey;
        if (anthropicKey) keyMap["anthropic"] = anthropicKey;
        if (googleKey) keyMap["google"] = googleKey;
        if (falKey) keyMap["fal"] = falKey;
        setApiKeys(keyMap);

        if (accountsRes.accounts) {
          setAccounts(accountsRes.accounts);
        }

        if (prefsRes.preferences) {
          setNotificationPrefs(prefsRes.preferences);
        }

        if (configRes.config) {
          const cfg = configRes.config;
          setBrandVoice(cfg.brandVoice || "");
          setPostingGoals(cfg.postingGoals || "");
          
          if (cfg.postingSchedule) {
            const schedule = cfg.postingSchedule as any;
            setTimezone(schedule.timezone || "UTC");
            setActiveDays(schedule.activeDays || []);
            setTimesText((schedule.times || []).join(", "));
            setSelectedAccountIds(schedule.selectedAccountIds || []);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadData();
  }, []);

  const submitSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    // Clean up times input (e.g. "09:00, 14:00" -> ["09:00", "14:00"])
    const times = timesText.split(",").map(t => t.trim()).filter(t => t.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/));

    try {
      const res = await saveAgentConfig({
        brandVoice,
        postingGoals,
        postingSchedule: {
          timezone,
          activeDays,
          times,
          selectedAccountIds
        }
      });

      if (res.success) {
        setSaveSuccess(true);
        toast.success("Settings saved successfully");
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        toast.error(res.error || "Failed to save configuration");
      }
    } catch (err) {
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitSave();
  };

  const handleSaveApiKey = async (provider: string) => {
    const val = (keyInputs[provider] || "").trim();
    if (!val) return;
    setSavingKey(prev => ({ ...prev, [provider]: true }));
    setSavedKey(prev => ({ ...prev, [provider]: false }));
    try {
      const res = await saveApiKey(provider, val);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      const updated = await getApiKey(provider);
      setApiKeys((prev) => ({
        ...prev,
        [provider]: updated || { id: "saved", provider, status: "active" },
      }));
      setKeyInputs(prev => ({ ...prev, [provider]: "" }));
      setSavedKey(prev => ({ ...prev, [provider]: true }));
      toast.success(`${provider} API key saved`);
      setTimeout(() => setSavedKey(prev => ({ ...prev, [provider]: false })), 3000);
    } catch {
      toast.error(`Failed to save ${provider} API key`);
    } finally {
      setSavingKey(prev => ({ ...prev, [provider]: false }));
    }
  };

  const handleSaveNotifications = async () => {
    if (!notificationPrefs) return;
    setSavingNotifications(true);
    setNotificationsSaved(false);
    try {
      const res = await saveNotificationPreferences(notificationPrefs);
      if (res.preferences) {
        setNotificationPrefs(res.preferences);
        setNotificationsSaved(true);
        toast.success("Notification preferences saved");
        setTimeout(() => setNotificationsSaved(false), 3000);
      } else {
        toast.error(res.error || "Failed to save notification preferences");
      }
    } catch (err) {
      toast.error("Failed to save notification preferences");
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleDeleteKey = async (provider: string) => {
    try {
      await deleteApiKey(provider);
      setApiKeys((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
      toast.success(`Removed ${provider} API key`);
    } catch {
      toast.error("Failed to delete key");
    }
  };

  const toggleDay = (dayId: string) => {
    setActiveDays(prev => 
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    );
  };

  const toggleAccount = (accId: string) => {
    setSelectedAccountIds(prev => 
      prev.includes(accId) ? prev.filter(a => a !== accId) : [...prev, accId]
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure your agent, integrations, API keys, and workspace preferences.</p>
        </div>

        {activeTab === "persona" && (
          <button
            type="button"
            onClick={() => submitSave()}
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-400" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saveSuccess ? "Saved!" : "Save Changes"}
          </button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/60 border border-border">
          <TabsTrigger value="persona" className="flex items-center gap-2 py-2 px-3 text-xs sm:text-sm">
            <UserIcon className="h-4 w-4" />
            <span>Persona & Schedule</span>
          </TabsTrigger>
          <TabsTrigger value="byok" className="flex items-center gap-2 py-2 px-3 text-xs sm:text-sm">
            <Sparkles className="h-4 w-4" />
            <span>AI Models (BYOK)</span>
          </TabsTrigger>
          <TabsTrigger value="apps" className="flex items-center gap-2 py-2 px-3 text-xs sm:text-sm">
            <PlugZap className="h-4 w-4" />
            <span>Integrations</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-2 py-2 px-3 text-xs sm:text-sm">
            <KeyIcon className="h-4 w-4" />
            <span>API Tokens</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2 py-2 px-3 text-xs sm:text-sm">
            <Bell className="h-4 w-4" />
            <span>Notifications</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Persona & Schedule */}
        <TabsContent value="persona">
          <form onSubmit={handleSaveForm} className="space-y-6">
        
            {/* Persona Section */}
            <section className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="bg-muted/40 px-6 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Persona & Voice</h2>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Brand Voice
                  </label>
                  <textarea
                    value={brandVoice}
                    onChange={(e) => setBrandVoice(e.target.value)}
                    placeholder="e.g. Professional yet conversational. We use emojis sparingly. We always focus on providing actionable value to developers."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[120px]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Posting Goals & Content Strategy
                  </label>
                  <textarea
                    value={postingGoals}
                    onChange={(e) => setPostingGoals(e.target.value)}
                    placeholder="e.g. Our main goal is to drive signups for our SaaS. We want to share 1 technical tip, 1 industry news piece, and 1 product update per week."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[120px]"
                  />
                </div>
              </div>
            </section>

            {/* Schedule Section */}
            <section className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="bg-muted/40 px-6 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Schedule</h2>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="America/Chicago">America/Chicago (CST/CDT)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                    <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    Days to Post
                  </label>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Days to post">
                    {DAYS_OF_WEEK.map(day => (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => toggleDay(day.id)}
                        aria-pressed={activeDays.includes(day.id)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                          activeDays.includes(day.id)
                            ? "bg-primary border-primary text-primary-foreground font-semibold shadow-xs"
                            : "bg-card border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Times to Post (24h format, comma separated)
                  </label>
                  <input
                    type="text"
                    value={timesText}
                    onChange={(e) => setTimesText(e.target.value)}
                    placeholder="09:00, 14:30, 18:00"
                    className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-2">The agent will attempt to generate and post content at these specific times on the days selected above.</p>
                </div>
              </div>
            </section>

            {/* Platforms Section */}
            <section className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="bg-muted/40 px-6 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Active Platforms</h2>
                <p className="text-xs text-muted-foreground mt-1">Select which connected accounts Joey should post to.</p>
              </div>
              <div className="p-6">
                {accounts.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">
                    No accounts connected. Go to the <a href="/accounts" className="text-primary hover:underline font-medium">Accounts</a> page to connect them.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accounts.map(acc => (
                      <label key={acc.id} className="flex items-center gap-3 p-4 border border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedAccountIds.includes(acc.id)}
                          onChange={() => toggleAccount(acc.id)}
                          className="h-4 w-4 rounded border-input text-primary focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        {acc.avatarUrl ? (
                          <img src={acc.avatarUrl} alt={acc.accountName || ""} className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground capitalize text-xs">
                            {acc.platform.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="font-medium text-sm truncate capitalize">{acc.accountName}</p>
                          <p className="text-xs text-muted-foreground capitalize">{acc.platform}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </form>
        </TabsContent>

        {/* Tab 2: AI Models (BYOK) */}
        <TabsContent value="byok" className="space-y-6">
          {/* Usage & Billing Section */}
          <section className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="bg-muted/40 px-6 py-4 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-foreground">Usage & Billing</h2>
                <p className="text-xs text-muted-foreground mt-1">Track your LLM token usage for the current billing period.</p>
              </div>
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="p-6">
              {usageStats ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-muted/30 p-4 rounded-lg border border-border">
                      <p className="text-sm text-muted-foreground mb-1">Input Tokens</p>
                      <p className="text-2xl font-bold">{(usageStats.inputTokensUsed ?? 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-muted/30 p-4 rounded-lg border border-border">
                      <p className="text-sm text-muted-foreground mb-1">Output Tokens</p>
                      <p className="text-2xl font-bold">{(usageStats.outputTokensUsed ?? 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-muted/30 p-4 rounded-lg border border-border">
                      <p className="text-sm text-muted-foreground mb-1">Estimated Cost</p>
                      <p className="text-2xl font-bold">${Number(usageStats.estimatedCostUsd ?? 0).toFixed(4)}</p>
                    </div>
                  </div>

                  {usageStats.budgetLimitUsd && (
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium text-foreground">Monthly Budget</span>
                        <span className="text-muted-foreground">${Number(usageStats.estimatedCostUsd).toFixed(2)} / ${Number(usageStats.budgetLimitUsd).toFixed(2)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full ${
                            Number(usageStats.estimatedCostUsd) / Number(usageStats.budgetLimitUsd) > 0.9
                              ? 'bg-destructive'
                              : Number(usageStats.estimatedCostUsd) / Number(usageStats.budgetLimitUsd) > 0.7
                                ? 'bg-amber-500'
                                : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(100, (Number(usageStats.estimatedCostUsd) / Number(usageStats.budgetLimitUsd)) * 100)}%` }}
                        ></div>
                      </div>
                      {Number(usageStats.estimatedCostUsd) / Number(usageStats.budgetLimitUsd) > 0.9 && (
                        <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          You are approaching your monthly budget limit. Agent activity will be paused if you exceed this limit.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-4 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading usage stats...
                </div>
              )}
            </div>
          </section>

          {/* AI & Model Provider Keys (BYOK) */}
          <section className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="bg-muted/40 px-6 py-4 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-foreground">AI & Model Provider Keys (BYOK)</h2>
                <p className="text-xs text-muted-foreground mt-1">Bring your own API keys for agent reasoning, text generation, and image generation. All keys are encrypted at rest with AES-256-GCM and cryptographically isolated to your workspace.</p>
              </div>
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="p-6 space-y-6">
              {AI_PROVIDERS.map((provider) => {
                const currentConfig = apiKeys[provider.id];
                const inputValue = keyInputs[provider.id] || "";
                const isVisible = !!showKeys[provider.id];
                const isSavingThis = !!savingKey[provider.id];
                const isSavedThis = !!savedKey[provider.id];

                return (
                  <div key={provider.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-foreground">
                        {provider.name} ({provider.models})
                      </label>
                      {currentConfig && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-mono">
                          <CheckCircle2 className="h-3 w-3" />
                          {currentConfig.maskedKey || "Configured"}
                          <button
                            type="button"
                            onClick={() => handleDeleteKey(provider.id)}
                            className="ml-2 text-muted-foreground hover:text-destructive transition-colors"
                            title={`Remove ${provider.name} key`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={isVisible ? "text" : "password"}
                          value={inputValue}
                          onChange={(e) => setKeyInputs(prev => ({ ...prev, [provider.id]: e.target.value }))}
                          placeholder={currentConfig ? `${provider.placeholder} (replace existing)` : provider.placeholder}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={isVisible ? "Hide key" : "Show key"}
                        >
                          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveApiKey(provider.id)}
                        disabled={!inputValue.trim() || isSavingThis}
                        className="flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {isSavingThis ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isSavedThis ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                        ) : (
                          "Save"
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your {provider.name} API key from{" "}
                      <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                        {provider.docsName}
                      </a>
                      . {provider.note}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </TabsContent>

        {/* Tab 3: Integrations */}
        <TabsContent value="apps" className="space-y-6">
          <section className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="bg-muted/40 px-6 py-4 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-foreground">Connected Apps</h2>
                <p className="text-xs text-muted-foreground mt-1">Connect external services for news, search, email, calendar, and more. Joey can use these to research and curate content.</p>
              </div>
              <PlugZap className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="p-6">
              <ConnectionsPanel />
            </div>
          </section>

          <section className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="bg-muted/40 px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Flow Integrations & Webhooks</h2>
              <p className="text-xs text-muted-foreground mt-1">API keys and credentials used by automated flow builder nodes. Stored encrypted per workspace.</p>
            </div>
            <div className="p-6 space-y-6">
              <IntegrationsPanel />
              <TelegramPanel />
            </div>
          </section>
        </TabsContent>

        {/* Tab 4: API Tokens */}
        <TabsContent value="api" className="space-y-6">
          <section className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="bg-muted/40 px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Developer API Tokens</h2>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Bearer tokens for the Joey public REST API (<code className="font-mono text-primary">/api/v1</code>).{" "}
                <a href="/docs" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                  Read the docs →
                </a>
              </p>
            </div>
            <div className="p-6">
              <ApiTokensPanel />
            </div>
          </section>
        </TabsContent>

        {/* Tab 5: Notifications */}
        <TabsContent value="notifications" className="space-y-6">
          <section className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="bg-muted/40 px-6 py-4 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-foreground">Notification Preferences</h2>
                <p className="text-xs text-muted-foreground mt-1">Manage how and when you receive updates.</p>
              </div>
              <Bell className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="p-6 space-y-6">
              {notificationPrefs ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={notificationPrefs.emailAddress || ""}
                      onChange={(e) => setNotificationPrefs({ ...notificationPrefs, emailAddress: e.target.value })}
                      placeholder="you@example.com"
                      className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Where we should send email notifications.</p>
                  </div>

                  <div className="border border-border rounded-lg overflow-hidden flex overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[600px]">
                      <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                        <tr>
                          <th className="px-4 py-3 font-medium">Event</th>
                          <th className="px-4 py-3 font-medium text-center">In-App</th>
                          <th className="px-4 py-3 font-medium text-center">Email</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[
                          { key: "DraftReady", label: "New Draft Ready" },
                          { key: "EngagementReply", label: "Comment Needs Reply" },
                          { key: "PublishSuccess", label: "Post Published Successfully" },
                          { key: "PublishFailed", label: "Post Failed to Publish" },
                          { key: "ApiFailure", label: "API Connection Failure" },
                        ].map((item) => (
                          <tr key={item.key} className="bg-card hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground">{item.label}</td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={notificationPrefs[`inApp${item.key}`]}
                                onChange={(e) => setNotificationPrefs({ ...notificationPrefs, [`inApp${item.key}`]: e.target.checked })}
                                className="h-4 w-4 rounded border-input text-primary focus-visible:ring-1 focus-visible:ring-ring"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={notificationPrefs[`email${item.key}`]}
                                onChange={(e) => setNotificationPrefs({ ...notificationPrefs, [`email${item.key}`]: e.target.checked })}
                                className="h-4 w-4 rounded border-input text-primary focus-visible:ring-1 focus-visible:ring-ring"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSaveNotifications}
                      disabled={savingNotifications}
                      className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {savingNotifications ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : notificationsSaved ? (
                        <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-300" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      {notificationsSaved ? "Saved!" : "Save Preferences"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-4 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading preferences...
                </div>
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
