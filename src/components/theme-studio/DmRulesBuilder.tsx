"use client";

import * as React from "react";
import { 
  IconPlus, 
  IconTrash, 
  IconMessageCircle, 
  IconSend, 
  IconClick, 
  IconCheck, 
  IconExternalLink,
  IconLoader2
} from "@tabler/icons-react";
import { createDmRule, deleteDmRule, toggleDmRule } from "@/app/actions/dm-rules";
import { toast } from "sonner";

interface DmRuleItem {
  id: string;
  themePageId: string;
  triggerType: string;
  triggerValue: string;
  responseTemplate: string;
  responseLink?: string | null;
  isActive: boolean;
  stats?: any;
}

interface DmRulesBuilderProps {
  themePageId: string;
  initialRules: DmRuleItem[];
}

export function DmRulesBuilder({ themePageId, initialRules }: DmRulesBuilderProps) {
  const [rules, setRules] = React.useState<DmRuleItem[]>(initialRules);
  const [isAdding, setIsAdding] = React.useState(false);
  const [triggerValue, setTriggerValue] = React.useState("GUIDE");
  const [responseTemplate, setResponseTemplate] = React.useState(
    "Hey {{username}}! Thanks for checking out our post. Here is the free breakdown and resources we promised: {{link}}"
  );
  const [responseLink, setResponseLink] = React.useState("https://yourstore.com/playbook");
  const [loading, setLoading] = React.useState(false);

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    if (!triggerValue.trim() || !responseTemplate.trim()) return;

    setLoading(true);
    try {
      const res = await createDmRule({
        themePageId,
        triggerValue: triggerValue.trim(),
        responseTemplate: responseTemplate.trim(),
        responseLink: responseLink.trim() || undefined,
      });

      if (res.error) throw new Error(res.error);
      if (res.rule) {
        setRules((prev) => [res.rule as DmRuleItem, ...prev]);
        setIsAdding(false);
        toast.success("Keyword DM funnel created");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to create rule");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(ruleId: string) {
    try {
      const res = await toggleDmRule(ruleId);
      if (res.error) throw new Error(res.error);
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, isActive: !r.isActive } : r))
      );
      toast.success("Rule status updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle rule");
    }
  }

  async function handleDelete(ruleId: string) {
    try {
      const res = await deleteDmRule(ruleId);
      if (res.error) throw new Error(res.error);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      toast.success("Rule deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete rule");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Keyword DM Funnels</h2>
          <p className="text-sm text-muted-foreground">
            Automatically direct-message followers when they comment a specific keyword on your posts.
          </p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm self-start"
        >
          <IconPlus className="w-4 h-4" /> New DM Trigger
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddRule} className="p-5 border rounded-xl bg-card/60 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold">Create DM Funnel Trigger</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Trigger Keyword (e.g. GUIDE, STATS, FREE)
              </label>
              <input
                type="text"
                value={triggerValue}
                onChange={(e) => setTriggerValue(e.target.value)}
                placeholder="GUIDE"
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background font-mono font-bold uppercase"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Destination / Lead Magnet Link
              </label>
              <input
                type="url"
                value={responseLink}
                onChange={(e) => setResponseLink(e.target.value)}
                placeholder="https://yourpage.com/resource"
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background font-mono text-xs"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Automated DM Response Message
              </label>
              <textarea
                rows={3}
                value={responseTemplate}
                onChange={(e) => setResponseTemplate(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Supported tags: <code className="font-mono">{"{{username}}"}</code>, <code className="font-mono">{"{{link}}"}</code>
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading && <IconLoader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Funnel
            </button>
          </div>
        </form>
      )}

      {rules.length === 0 ? (
        <div className="p-12 text-center border border-dashed rounded-xl">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <IconMessageCircle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold">No DM funnels configured</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
            Turn post comments into email subscribers, sales, or clicks with keyword triggers.
          </p>
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg"
          >
            <IconPlus className="w-3.5 h-3.5" /> Add Keyword Funnel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="p-5 border rounded-2xl bg-card flex flex-col justify-between space-y-4 shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-lg text-xs font-extrabold font-mono bg-primary/15 text-primary border border-primary/20">
                      "{rule.triggerValue}"
                    </span>
                    <button
                      onClick={() => handleToggle(rule.id)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        rule.isActive
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {rule.isActive ? "Active" : "Disabled"}
                    </button>
                  </div>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-foreground bg-muted/30 p-3 rounded-xl border font-mono whitespace-pre-line mt-3">
                  {rule.responseTemplate}
                </p>

                {rule.responseLink && (
                  <a
                    href={rule.responseLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline mt-2"
                  >
                    <IconExternalLink className="w-3 h-3" /> {rule.responseLink}
                  </a>
                )}
              </div>

              <div className="pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <IconSend className="w-3.5 h-3.5" /> {rule.stats?.dmsSent || 0} DMs Sent
                </span>
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  <IconClick className="w-3.5 h-3.5" /> {rule.stats?.clicks || 0} Clicks
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
