'use client';

import { useState, useEffect } from "react";
import { getAgentConfig, saveAgentConfig } from "@/app/actions/agent";
import { getConnectedAccounts } from "@/app/actions/zernio";
import { getUsage } from "@/app/actions/usage";
import { getApiKey, saveApiKey, deleteApiKey } from "@/app/actions/api-keys";
import { getNotificationPreferences, saveNotificationPreferences } from "@/app/actions/notifications";
import { Loader2, Save, CheckCircle2, TrendingUp, AlertTriangle, Sparkles, Eye, EyeOff, Trash2, PlugZap, Bell } from "lucide-react";
import { ConnectionsPanel } from "./connections-panel";
import { ApiTokensPanel } from "./api-tokens-panel";

const DAYS_OF_WEEK = [
  { id: "mon", label: "Monday" },
  { id: "tue", label: "Tuesday" },
  { id: "wed", label: "Wednesday" },
  { id: "thu", label: "Thursday" },
  { id: "fri", label: "Friday" },
  { id: "sat", label: "Saturday" },
  { id: "sun", label: "Sunday" },
];

export default function SettingsPage() {
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
  
  const [apiKeys, setApiKeys] = useState<Record<string, { id: string; provider: string; status: string }>>({});
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [falKeyInput, setFalKeyInput] = useState("");
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showFalKey, setShowFalKey] = useState(false);
  const [savingOpenai, setSavingOpenai] = useState(false);
  const [savingFal, setSavingFal] = useState(false);
  const [openaiSaved, setOpenaiSaved] = useState(false);
  const [falSaved, setFalSaved] = useState(false);

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

        const [openaiKey, falKey] = await Promise.all([
          getApiKey("openai"),
          getApiKey("fal"),
        ]);
        const keyMap: Record<string, { id: string; provider: string; status: string }> = {};
        if (openaiKey) keyMap["openai"] = openaiKey;
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
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert(res.error || "Failed to save configuration");
      }
    } catch (err) {
      alert("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitSave();
  };

  const handleSaveOpenaiKey = async () => {
    if (!openaiKeyInput.trim()) return;
    setSavingOpenai(true);
    setOpenaiSaved(false);
    try {
      await saveApiKey("openai", openaiKeyInput.trim());
      setApiKeys((prev) => ({
        ...prev,
        openai: { id: "saved", provider: "openai", status: "active" },
      }));
      setOpenaiKeyInput("");
      setOpenaiSaved(true);
      setTimeout(() => setOpenaiSaved(false), 3000);
    } catch {
      alert("Failed to save OpenAI key");
    } finally {
      setSavingOpenai(false);
    }
  };

  const handleSaveFalKey = async () => {
    if (!falKeyInput.trim()) return;
    setSavingFal(true);
    setFalSaved(false);
    try {
      await saveApiKey("fal", falKeyInput.trim());
      setApiKeys((prev) => ({
        ...prev,
        fal: { id: "saved", provider: "fal", status: "active" },
      }));
      setFalKeyInput("");
      setFalSaved(true);
      setTimeout(() => setFalSaved(false), 3000);
    } catch {
      alert("Failed to save fal.ai key");
    } finally {
      setSavingFal(false);
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
        setTimeout(() => setNotificationsSaved(false), 3000);
      } else {
        alert(res.error || "Failed to save notification preferences");
      }
    } catch (err) {
      alert("Failed to save notification preferences");
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
    } catch {
      alert("Failed to delete key");
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
      <div className="flex h-[calc(100vh-100px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent Configuration</h1>
          <p className="text-muted-foreground mt-1">Teach Joey how to sound and when to post</p>
        </div>
        
        <button
          type="button"
          onClick={() => submitSave()}
          disabled={isSaving}
          className="flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : saveSuccess ? (
            <CheckCircle2 className="mr-2 h-4 w-4 text-green-300" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saveSuccess ? "Saved!" : "Save Changes"}
        </button>
      </div>

      <form onSubmit={handleSaveForm} className="space-y-8">
        
        {/* Persona Section */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
          <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-b">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Persona & Voice</h2>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Brand Voice
              </label>
              <textarea
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
                placeholder="e.g. Professional yet conversational. We use emojis sparingly. We always focus on providing actionable value to developers."
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white min-h-[120px]"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Posting Goals & Content Strategy
              </label>
              <textarea
                value={postingGoals}
                onChange={(e) => setPostingGoals(e.target.value)}
                placeholder="e.g. Our main goal is to drive signups for our SaaS. We want to share 1 technical tip, 1 industry news piece, and 1 product update per week."
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white min-h-[120px]"
              />
            </div>
          </div>
        </section>

        {/* Schedule Section */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
          <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-b">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Schedule</h2>
          </div>
          <div className="p-6 space-y-6">
            
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                {/* A small subset for MVP. Normally we'd use Intl.supportedValuesOf('timeZone') */}
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
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Days to Post
              </label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                      activeDays.includes(day.id)
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Times to Post (24h format, comma separated)
              </label>
              <input
                type="text"
                value={timesText}
                onChange={(e) => setTimesText(e.target.value)}
                placeholder="09:00, 14:30, 18:00"
                className="w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              <p className="text-xs text-zinc-500 mt-2">The agent will attempt to generate and post content at these specific times on the days selected above.</p>
            </div>

          </div>
        </section>

        {/* Platforms Section */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
          <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-b">
            <h2 className="font-semibold text-zinc-900 dark:text-white">Active Platforms</h2>
            <p className="text-xs text-zinc-500 mt-1">Select which connected accounts Joey should post to.</p>
          </div>
          <div className="p-6">
            {accounts.length === 0 ? (
              <div className="text-sm text-zinc-500 py-4">
                No accounts connected. Go to the <a href="/accounts" className="text-indigo-600 hover:underline">Accounts</a> page to connect them.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.map(acc => (
                  <label key={acc.id} className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedAccountIds.includes(acc.id)}
                      onChange={() => toggleAccount(acc.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    {acc.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={acc.avatarUrl} alt={acc.accountName || ""} className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 capitalize text-xs">
                        {acc.platform.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 overflow-hidden">
                      <p className="font-medium text-sm truncate capitalize">{acc.accountName}</p>
                      <p className="text-xs text-zinc-500 capitalize">{acc.platform}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Usage & Billing Section */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
          <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-b flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-zinc-900 dark:text-white">Usage & Billing</h2>
              <p className="text-xs text-zinc-500 mt-1">Track your LLM token usage for the current billing period.</p>
            </div>
            <TrendingUp className="h-5 w-5 text-zinc-400" />
          </div>
          <div className="p-6">
            {usageStats ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-lg border">
                    <p className="text-sm text-zinc-500 mb-1">Input Tokens</p>
                    <p className="text-2xl font-bold">{(usageStats.inputTokensUsed ?? 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-lg border">
                    <p className="text-sm text-zinc-500 mb-1">Output Tokens</p>
                    <p className="text-2xl font-bold">{(usageStats.outputTokensUsed ?? 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-lg border">
                    <p className="text-sm text-zinc-500 mb-1">Estimated Cost</p>
                    <p className="text-2xl font-bold">${Number(usageStats.estimatedCostUsd ?? 0).toFixed(4)}</p>
                  </div>
                </div>

                {usageStats.budgetLimitUsd && (
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">Monthly Budget</span>
                      <span className="text-zinc-500">${Number(usageStats.estimatedCostUsd).toFixed(2)} / ${Number(usageStats.budgetLimitUsd).toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2.5">
                      <div 
                        className={`h-2.5 rounded-full ${
                          Number(usageStats.estimatedCostUsd) / Number(usageStats.budgetLimitUsd) > 0.9 
                            ? 'bg-red-500' 
                            : Number(usageStats.estimatedCostUsd) / Number(usageStats.budgetLimitUsd) > 0.7 
                              ? 'bg-yellow-500' 
                              : 'bg-indigo-600'
                        }`}
                        style={{ width: `${Math.min(100, (Number(usageStats.estimatedCostUsd) / Number(usageStats.budgetLimitUsd)) * 100)}%` }}
                      ></div>
                    </div>
                    {Number(usageStats.estimatedCostUsd) / Number(usageStats.budgetLimitUsd) > 0.9 && (
                      <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        You are approaching your monthly budget limit. Agent activity will be paused if you exceed this limit.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-zinc-500 py-4 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading usage stats...
              </div>
            )}
          </div>
        </section>

        {/* Notifications Section */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
          <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-b flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-zinc-900 dark:text-white">Notifications</h2>
              <p className="text-xs text-zinc-500 mt-1">Manage how and when you receive updates.</p>
            </div>
            <Bell className="h-5 w-5 text-zinc-400" />
          </div>
          <div className="p-6 space-y-6">
            {notificationPrefs ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={notificationPrefs.emailAddress || ""}
                    onChange={(e) => setNotificationPrefs({ ...notificationPrefs, emailAddress: e.target.value })}
                    placeholder="you@example.com"
                    className="w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Where we should send email notifications.</p>
                </div>
                
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden flex overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[600px]">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-4 py-3 font-medium">Event</th>
                        <th className="px-4 py-3 font-medium text-center">In-App</th>
                        <th className="px-4 py-3 font-medium text-center">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {[
                        { key: "DraftReady", label: "New Draft Ready" },
                        { key: "EngagementReply", label: "Comment Needs Reply" },
                        { key: "PublishSuccess", label: "Post Published Successfully" },
                        { key: "PublishFailed", label: "Post Failed to Publish" },
                        { key: "ApiFailure", label: "API Connection Failure" },
                      ].map((item) => (
                        <tr key={item.key} className="bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{item.label}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={notificationPrefs[`inApp${item.key}`]}
                              onChange={(e) => setNotificationPrefs({ ...notificationPrefs, [`inApp${item.key}`]: e.target.checked })}
                              className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-600"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={notificationPrefs[`email${item.key}`]}
                              onChange={(e) => setNotificationPrefs({ ...notificationPrefs, [`email${item.key}`]: e.target.checked })}
                              className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-600"
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
                    className="flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingNotifications ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : notificationsSaved ? (
                      <CheckCircle2 className="mr-2 h-4 w-4 text-green-300" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {notificationsSaved ? "Saved!" : "Save Preferences"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-500 py-4 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading preferences...
              </div>
            )}
          </div>
        </section>

        {/* Connected Apps (Composio) Section */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
          <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-b flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-zinc-900 dark:text-white">Connected Apps</h2>
              <p className="text-xs text-zinc-500 mt-1">Connect external services for news, search, email, calendar, and more. Joey can use these to research and curate content.</p>
            </div>
            <PlugZap className="h-5 w-5 text-zinc-400" />
          </div>
          <div className="p-6">
            <ConnectionsPanel />
          </div>
        </section>

        {/* Image Generation API Keys Section */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
          <div className="bg-zinc-50 dark:bg-zinc-950/50 px-6 py-4 border-b flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-zinc-900 dark:text-white">Image Generation API Keys</h2>
              <p className="text-xs text-zinc-500 mt-1">Bring your own API key to generate images from the compose page or agent.</p>
            </div>
            <Sparkles className="h-5 w-5 text-zinc-400" />
          </div>
          <div className="p-6 space-y-6">
            {/* OpenAI */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  OpenAI (DALL-E 3)
                </label>
                {apiKeys["openai"] && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Configured
                    <button
                      type="button"
                      onClick={() => handleDeleteKey("openai")}
                      className="ml-2 text-zinc-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showOpenaiKey ? "text" : "password"}
                    value={openaiKeyInput}
                    onChange={(e) => setOpenaiKeyInput(e.target.value)}
                    placeholder={apiKeys["openai"] ? "sk-... (replace existing)" : "sk-..."}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-10 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSaveOpenaiKey}
                  disabled={!openaiKeyInput.trim() || savingOpenai}
                  className="flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingOpenai ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : openaiSaved ? (
                    <CheckCircle2 className="h-4 w-4 text-green-300" />
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
              <p className="text-xs text-zinc-500">Your OpenAI API key with access to DALL-E 3. Stored encrypted.</p>
            </div>

            {/* fal.ai */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  fal.ai (Flux)
                </label>
                {apiKeys["fal"] && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Configured
                    <button
                      type="button"
                      onClick={() => handleDeleteKey("fal")}
                      className="ml-2 text-zinc-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showFalKey ? "text" : "password"}
                    value={falKeyInput}
                    onChange={(e) => setFalKeyInput(e.target.value)}
                    placeholder={apiKeys["fal"] ? "FAL_KEY (replace existing)" : "FAL_KEY"}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-10 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFalKey(!showFalKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    {showFalKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSaveFalKey}
                  disabled={!falKeyInput.trim() || savingFal}
                  className="flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingFal ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : falSaved ? (
                    <CheckCircle2 className="h-4 w-4 text-green-300" />
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
              <p className="text-xs text-zinc-500">Your fal.ai API key (FAL_KEY). Get one at <a href="https://fal.ai/dashboard" target="_blank" className="text-indigo-600 hover:underline">fal.ai/dashboard</a>. Stored encrypted.</p>
            </div>
          </div>
        </section>

        {/* Developer API */}
        <section className="mb-8 rounded-2xl bg-zinc-800/50 p-6">
          <h2 className="font-semibold text-zinc-900 dark:text-white">Developer API</h2>
          <p className="text-xs text-zinc-500 mt-1 mb-5">
            Bearer tokens for the public REST API (<code className="font-mono">/api/v1</code>).{" "}
            <a href="/docs" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              Read the docs →
            </a>
          </p>
          <ApiTokensPanel />
        </section>

      </form>
    </div>
  );
}
