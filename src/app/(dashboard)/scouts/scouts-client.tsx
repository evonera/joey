"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createScout,
  runScoutNow,
  toggleScout,
  deleteScout,
} from "@/app/actions/scouts";
import { toast } from "sonner";
import {
  Binoculars,
  Plus,
  Play,
  Pause,
  Trash2,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScoutItem {
  id: string;
  name: string;
  targetUrl: string;
  platform: string;
  goalCondition: string;
  pollIntervalMinutes: number;
  isActive: boolean;
  lastPolledAt: Date | null;
  latestAlert: any;
  createdAt: Date;
  updatedAt: Date;
}

export function ScoutsClient({ initialScouts }: { initialScouts: ScoutItem[] }) {
  const router = useRouter();
  const [scoutsList, setScoutsList] = useState<ScoutItem[]>(initialScouts);
  const [selectedId, setSelectedId] = useState<string>(
    initialScouts[0]?.id ?? ""
  );
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [scoutToDelete, setScoutToDelete] = useState<ScoutItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Synchronize state when server props update
  useEffect(() => {
    setScoutsList(initialScouts);
  }, [initialScouts]);

  useEffect(() => {
    if (initialScouts.length > 0 && (!selectedId || !initialScouts.some((s) => s.id === selectedId))) {
      setSelectedId(initialScouts[0].id);
    }
  }, [initialScouts, selectedId]);

  // New scout form state
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newPlatform, setNewPlatform] = useState<"instagram" | "tiktok" | "twitter" | "web">("instagram");
  const [newGoal, setNewGoal] = useState("");
  const [newInterval, setNewInterval] = useState(120);

  const selectedScout = scoutsList.find((s) => s.id === selectedId) || scoutsList[0];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createScout({
        name: newName,
        targetUrl: newUrl,
        platform: newPlatform,
        goalCondition: newGoal,
        pollIntervalMinutes: newInterval,
      });
      toast.success("Scout created successfully!");
      setIsNewOpen(false);
      setScoutsList((prev) => [created as any, ...prev]);
      setSelectedId(created.id);
      setNewName("");
      setNewUrl("");
      setNewGoal("");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to create scout");
    }
  };

  const handleRunNow = async (scoutId: string) => {
    setIsRunning(true);
    try {
      const res = await runScoutNow(scoutId);
      // Immediately reflect updated alert and timestamp in local state
      setScoutsList((prev) =>
        prev.map((s) =>
          s.id === scoutId
            ? {
                ...s,
                latestAlert: res.alert !== undefined ? res.alert : s.latestAlert,
                lastPolledAt: new Date(),
              }
            : s
        )
      );

      if (res.triggered) {
        toast.success(`Scout triggered an alert!`);
      } else {
        toast.info("Scout completed. No new changes matched the goal.");
      }
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed running scout");
    } finally {
      setIsRunning(false);
    }
  };

  const handleToggle = async (scoutId: string, currentStatus: boolean) => {
    try {
      await toggleScout(scoutId, !currentStatus);
      setScoutsList((prev) =>
        prev.map((s) => (s.id === scoutId ? { ...s, isActive: !currentStatus } : s))
      );
      toast.success(!currentStatus ? "Scout resumed" : "Scout paused");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const confirmDelete = async () => {
    if (!scoutToDelete) return;
    setIsDeleting(true);
    try {
      await deleteScout(scoutToDelete.id);
      const remaining = scoutsList.filter((s) => s.id !== scoutToDelete.id);
      setScoutsList(remaining);
      if (selectedId === scoutToDelete.id) {
        setSelectedId(remaining[0]?.id ?? "");
      }
      toast.success("Scout deleted");
      setScoutToDelete(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const activeCount = scoutsList.filter((s) => s.isActive).length;
  const pausedCount = scoutsList.length - activeCount;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Binoculars className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Social Scouts
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Monitor competitor theme pages and creators for viral spikes and format shifts using Apify & LLM evaluation.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Sparkles className="size-3.5 text-amber-400" />
              <span>Ask in Chat</span>
            </Button>
          </Link>

          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground">
                <Plus className="size-3.5" />
                <span>New Scout</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold">Deploy New Social Scout</DialogTitle>
                <DialogDescription>Configure a competitor or account to monitor for content and activity changes.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Scout Name</label>
                  <Input
                    placeholder="e.g. Pubity Viral Hooks"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    className="text-xs h-8"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Platform</label>
                    <select
                      value={newPlatform}
                      onChange={(e) => setNewPlatform(e.target.value as any)}
                      className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                    >
                      <option value="instagram">Instagram</option>
                      <option value="tiktok">TikTok</option>
                      <option value="twitter">X / Twitter</option>
                      <option value="web">Web Page</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Check Cadence</label>
                    <select
                      value={newInterval}
                      onChange={(e) => setNewInterval(Number(e.target.value))}
                      className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                    >
                      <option value={30}>Every 30 mins</option>
                      <option value={60}>Every 1 hour</option>
                      <option value={120}>Every 2 hours</option>
                      <option value={360}>Every 6 hours</option>
                      <option value={1440}>Daily (24h)</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Target URL or Handle</label>
                  <Input
                    placeholder="https://instagram.com/pubity"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    required
                    className="text-xs h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Goal & Trigger Condition (Natural Language)
                  </label>
                  <Textarea
                    placeholder="Alert when any reel exceeds 50k views or introduces a new split-screen text hook format."
                    value={newGoal}
                    onChange={(e) => setNewGoal(e.target.value)}
                    required
                    rows={3}
                    className="text-xs resize-none"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    The Scout judge compares each batch against this condition before sending an alert.
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsNewOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" className="h-8 text-xs">
                    Start Monitoring
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {scoutsList.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border/60 p-12 text-center bg-card/30">
          <div className="size-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-3">
            <Binoculars className="size-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No Scouts Active Yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-5">
            Deploy an autonomous Scout to monitor competitor accounts on Instagram, TikTok, or Twitter. You’ll be alerted whenever they post a viral spike.
          </p>
          <Button size="sm" onClick={() => setIsNewOpen(true)} className="gap-1.5 text-xs">
            <Plus className="size-3.5" />
            <span>Create First Scout</span>
          </Button>
        </div>
      ) : (
        /* Scira 2-Style Split View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Scout List */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>
                {activeCount} active · {pausedCount} paused · {scoutsList.length} total
              </span>
            </div>

            <div className="space-y-2.5">
              {scoutsList.map((scout) => {
                const isSelected = scout.id === selectedScout?.id;
                const hasAlert = !!scout.latestAlert;
                return (
                  <div
                    key={scout.id}
                    onClick={() => setSelectedId(scout.id)}
                    className={cn(
                      "group relative flex flex-col p-4 rounded-xl border transition-all cursor-pointer",
                      isSelected
                        ? "border-amber-500/40 bg-card/90 shadow-xs"
                        : "border-border/40 bg-card/40 hover:border-border/80 hover:bg-card/60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            scout.isActive ? "bg-emerald-500" : "bg-muted-foreground/40"
                          )}
                        />
                        <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
                          {scout.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        every {scout.pollIntervalMinutes}m
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground truncate mt-1">
                      {scout.targetUrl}
                    </p>

                    <div className="mt-3 pt-2.5 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="truncate max-w-[200px]">
                        {hasAlert
                          ? `Alert: ${scout.latestAlert?.title || "Spike detected"}`
                          : "No alerts yet"}
                      </span>
                      {hasAlert && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-400">
                          Spike
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Detailed Alert & Goal Diff (Scira 2 Style) */}
          <div className="lg:col-span-7">
            {selectedScout ? (
              <div className="rounded-2xl border border-border/50 bg-card/60 p-5 sm:p-6 space-y-6">
                {/* Header & Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/90 font-semibold">
                      {selectedScout.latestAlert ? "LATEST ALERT" : "MONITOR CONFIGURATION"}
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-foreground mt-0.5">
                      {selectedScout.latestAlert?.title || selectedScout.name}
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>Target: {selectedScout.targetUrl}</span>
                      <span>·</span>
                      <span className="capitalize">{selectedScout.platform}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRunNow(selectedScout.id)}
                      disabled={isRunning}
                      className="h-8 px-2.5 text-xs gap-1"
                      title="Run scout scan right now"
                    >
                      <RefreshCw className={cn("size-3", isRunning && "animate-spin")} />
                      <span>{isRunning ? "Scanning…" : "Check Now"}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(selectedScout.id, selectedScout.isActive)}
                      className="h-8 px-2 text-xs"
                      title={selectedScout.isActive ? "Pause Scout" : "Resume Scout"}
                    >
                      {selectedScout.isActive ? (
                        <Pause className="size-3.5 text-muted-foreground" />
                      ) : (
                        <Play className="size-3.5 text-emerald-500" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setScoutToDelete(selectedScout)}
                      className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                      title="Delete Scout"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Section: Goal */}
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Goal Condition
                  </h4>
                  <div className="rounded-lg bg-background/50 border border-border/30 p-3 text-xs text-foreground/90 font-sans">
                    {selectedScout.goalCondition}
                  </div>
                </div>

                {/* Section: Changes / Before & After */}
                {selectedScout.latestAlert?.changes?.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Detected Changes & Spikes
                    </h4>
                    <div className="space-y-2.5">
                      {selectedScout.latestAlert.changes.map((change: any, idx: number) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-border/40 bg-background/40 p-4 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide",
                                change.type === "SPIKE"
                                  ? "bg-amber-500/15 text-amber-400"
                                  : "bg-blue-500/15 text-blue-400"
                              )}
                            >
                              {change.type || "CHANGED"}
                            </span>
                            <span className="text-xs font-semibold text-foreground">
                              {change.label}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                            {change.before && (
                              <div className="rounded-lg bg-card/60 p-2.5 border border-border/20">
                                <span className="text-[10px] text-muted-foreground font-mono block mb-0.5">
                                  Before
                                </span>
                                <span className="text-foreground/80">{change.before}</span>
                              </div>
                            )}
                            <div className="rounded-lg bg-amber-500/5 p-2.5 border border-amber-500/20">
                              <span className="text-[10px] text-amber-400 font-mono block mb-0.5">
                                Detected
                              </span>
                              <span className="text-foreground font-medium">{change.after}</span>
                            </div>
                          </div>

                          {change.rationale && (
                            <p className="text-[11px] text-muted-foreground italic pt-1">
                              Matches goal: {change.rationale}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">
                    No spike alerts triggered yet. Next scan will run automatically or you can click "Check Now".
                  </div>
                )}

                {/* Section: Actionable Next Steps (Theme Studio / Compose) */}
                {selectedScout.latestAlert && (
                  <div className="pt-4 border-t border-border/40 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      Spike detected · Ready to adapt for your own audience
                    </div>
                    <Link
                      href={`/theme-studio?remixPrompt=${encodeURIComponent(
                        `Remix this competitor spike format from ${selectedScout.name}: ${
                          selectedScout.latestAlert?.samplePost?.content || selectedScout.goalCondition
                        }`
                      )}`}
                    >
                      <Button size="sm" className="h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-semibold">
                        <Sparkles className="size-3.5" />
                        <span>Draft in Theme Studio</span>
                        <ArrowRight className="size-3" />
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!scoutToDelete} onOpenChange={(open) => !open && setScoutToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Scout</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">&ldquo;{scoutToDelete?.name}&rdquo;</span>? This will stop all monitoring and remove its change history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setScoutToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Scout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
