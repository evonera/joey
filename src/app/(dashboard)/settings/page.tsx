'use client';

import { useState, useEffect } from "react";
import { getAgentConfig, saveAgentConfig } from "@/app/actions/agent";
import { getConnectedAccounts } from "@/app/actions/zernio";
import { Loader2, Save, CheckCircle2 } from "lucide-react";

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
  
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [configRes, accountsRes] = await Promise.all([
          getAgentConfig(),
          getConnectedAccounts()
        ]);

        if (accountsRes.accounts) {
          setAccounts(accountsRes.accounts);
        }

        if (configRes.config) {
          const cfg = configRes.config;
          setBrandVoice(cfg.brandVoice || "");
          setPostingGoals(cfg.postingGoals || "");
          
          if (cfg.postingSchedule) {
            setTimezone(cfg.postingSchedule.timezone || "UTC");
            setActiveDays(cfg.postingSchedule.activeDays || []);
            setTimesText((cfg.postingSchedule.times || []).join(", "));
            setSelectedAccountIds(cfg.postingSchedule.selectedAccountIds || []);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
          onClick={handleSave}
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

      <form onSubmit={handleSave} className="space-y-8">
        
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
                      <img src={acc.avatarUrl} alt={acc.accountName} className="h-8 w-8 rounded-full object-cover" />
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

      </form>
    </div>
  );
}
