"use client";

import * as React from "react";
import { 
  IconPlus, 
  IconTrash, 
  IconPhoto, 
  IconCards, 
  IconVideo, 
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandX,
  IconLoader2,
  IconBulb,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { createThemeSlot, deleteThemeSlot } from "@/app/actions/theme-slots";
import {
  getMixRecommendations,
  acceptRecommendation,
  discardRecommendation,
} from "@/app/actions/mix-recommendations";
import { toast } from "sonner";

interface SlotItem {
  id: string;
  themePageId: string;
  formatId: string;
  label?: string | null;
  cadence: string;
  daysOfWeek?: any;
  priority: number;
  isActive: boolean;
  format?: {
    id: string;
    slug: string;
    name: string;
    platform: string;
    mediaType: string;
    aspectRatio?: string | null;
  } | null;
}

interface FormatItem {
  id: string;
  slug: string;
  name: string;
  platform: string;
  mediaType: string;
  aspectRatio?: string | null;
}

interface DailyMixSchedulerProps {
  themePageId: string;
  initialSlots: SlotItem[];
  availableFormats: FormatItem[];
}

export function DailyMixScheduler({ themePageId, initialSlots, availableFormats }: DailyMixSchedulerProps) {
  const supportedFormats = availableFormats.filter((format) => format.mediaType !== "video");
  const [slots, setSlots] = React.useState<SlotItem[]>(initialSlots);
  const [isAdding, setIsAdding] = React.useState(false);
  const [selectedFormatId, setSelectedFormatId] = React.useState(supportedFormats[0]?.id || "");
  const [slotLabel, setSlotLabel] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [recommendation, setRecommendation] = React.useState<{ id: string; formatScores: Record<string, { averageScore: number; sampleCount: number }>; adjustments: Array<{ slotId: string; formatId: string; previousPriority: number; newPriority: number; formatName: string; score: number }> } | null>(null);
  const [recLoading, setRecLoading] = React.useState(false);

  React.useEffect(() => {
    getMixRecommendations(themePageId).then((res) => setRecommendation(res.recommendation));
  }, [themePageId]);

  async function handleAcceptRecommendation() {
    if (!recommendation) return;
    setRecLoading(true);
    try {
      const res = await acceptRecommendation(recommendation.id);
      if (res.error) throw new Error(res.error);
      setRecommendation(null);
      toast.success(`Applied ${res.applied} slot reorder${res.applied === 1 ? "" : "s"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to apply recommendation");
    } finally {
      setRecLoading(false);
    }
  }

  async function handleDiscardRecommendation() {
    if (!recommendation) return;
    setRecLoading(true);
    try {
      const res = await discardRecommendation(recommendation.id);
      if (res.error) throw new Error(res.error);
      setRecommendation(null);
      toast.success("Recommendation dismissed");
    } catch (err: any) {
      toast.error(err.message || "Failed to dismiss recommendation");
    } finally {
      setRecLoading(false);
    }
  }

  async function handleAddSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFormatId) return;

    setLoading(true);
    try {
      const res = await createThemeSlot({
        themePageId,
        formatId: selectedFormatId,
        label: slotLabel.trim() || undefined,
        priority: slots.length,
      });

      if (res.error) throw new Error(res.error);
      if (res.slot) {
        setSlots((prev) => [...prev, res.slot as SlotItem]);
        setIsAdding(false);
        setSlotLabel("");
        toast.success("Slot added to daily mix");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to add slot");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSlot(slotId: string) {
    try {
      const res = await deleteThemeSlot(slotId);
      if (res.error) throw new Error(res.error);
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
      toast.success("Slot removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete slot");
    }
  }

  function renderMediaIcon(type?: string) {
    if (type === "video") return <IconVideo className="w-4 h-4 text-purple-500" />;
    if (type === "carousel") return <IconCards className="w-4 h-4 text-blue-500" />;
    return <IconPhoto className="w-4 h-4 text-emerald-500" />;
  }

  function renderPlatformIcon(platform?: string) {
    if (platform === "tiktok") return <IconBrandTiktok className="w-4 h-4 text-pink-500" />;
    if (platform === "x") return <IconBrandX className="w-4 h-4 text-foreground" />;
    return <IconBrandInstagram className="w-4 h-4 text-rose-500" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Daily Content Mix</h2>
          <p className="text-sm text-muted-foreground">
            Configure the daily slots Joey will automatically generate and queue for your approval.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shadow-sm self-start"
        >
          <IconPlus className="w-4 h-4" /> Add Slot
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddSlot} className="p-5 border rounded-xl bg-card/60 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold">New Mix Slot</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Content Format
              </label>
              <select
                value={selectedFormatId}
                onChange={(e) => setSelectedFormatId(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              >
                {supportedFormats.map((fmt) => (
                  <option key={fmt.id} value={fmt.id}>
                    {fmt.name} ({fmt.platform} · {fmt.mediaType} · {fmt.aspectRatio || "1:1"})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Slot Label / Purpose (Optional)
              </label>
              <input
                type="text"
                value={slotLabel}
                onChange={(e) => setSlotLabel(e.target.value)}
                placeholder="e.g. Morning News Breakdown"
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
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
              Save Slot
            </button>
          </div>
        </form>
      )}

      {slots.length === 0 ? (
        <div className="p-12 text-center border border-dashed rounded-xl">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <IconCards className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold">No slots in daily mix yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
            Add cards or carousels to define your daily recipe. Video recipes will become available with the production MP4 worker.
          </p>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg"
          >
            <IconPlus className="w-3.5 h-3.5" /> Add First Slot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {slots.map((slot, index) => (
            <div
              key={slot.id}
              className="p-4 border rounded-xl bg-card hover:border-primary/30 transition-all flex flex-col justify-between group shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                      #{index + 1}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                      {renderPlatformIcon(slot.format?.platform)}
                      <span className="capitalize">{slot.format?.platform || "Universal"}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteSlot(slot.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove slot"
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>

                <h4 className="font-semibold text-sm leading-tight text-foreground">
                  {slot.label || slot.format?.name || "Content Slot"}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Format: {slot.format?.name} ({slot.format?.aspectRatio || "1:1"})
                </p>
              </div>

              <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium capitalize">
                  {renderMediaIcon(slot.format?.mediaType)}
                  {slot.format?.mediaType}
                </span>
                <span className="px-2 py-0.5 bg-muted rounded text-[11px] font-medium">
                  {slot.cadence}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {recommendation && (
        <div className="p-5 border rounded-xl bg-amber-500/5 border-amber-500/20 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
              <IconBulb className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Mix Optimization Ready
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Joey analyzed your recent post performance and suggests reordering your daily mix slots.
                Higher-performing formats are moved earlier in the rotation.
              </p>
              <div className="mt-3 space-y-1.5">
                {recommendation.adjustments
                  .filter((a) => a.previousPriority !== a.newPriority)
                  .map((adj) => (
                    <div key={adj.slotId} className="text-xs text-muted-foreground">
                      <span className="font-medium">{adj.formatName}</span>
                      {" "}— {adj.previousPriority < adj.newPriority ? "moved down" : "moved up"}
                      {" "}to position #{adj.newPriority + 1}
                      <span className="ml-1.5 px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                        score {adj.score}
                      </span>
                    </div>
                  ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={handleAcceptRecommendation}
                  disabled={recLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {recLoading ? <IconLoader2 className="w-3.5 h-3.5 animate-spin" /> : <IconCheck className="w-3.5 h-3.5" />}
                  Apply Reorder
                </button>
                <button
                  type="button"
                  onClick={handleDiscardRecommendation}
                  disabled={recLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted disabled:opacity-50"
                >
                  <IconX className="w-3.5 h-3.5" />
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
