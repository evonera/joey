'use client';

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getConnectedAccounts } from "@/app/actions/zernio";
import { createManualPost, getDraftForCompose } from "@/app/actions/compose";
import { requestUploadUrl, registerAsset } from "@/app/actions/assets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformSelector } from "@/components/compose/platform-selector";
import { SchedulePicker, type ScheduleType } from "@/components/compose/schedule-picker";
import { PlatformPreviews } from "@/components/compose/platform-previews";
import { AssetPickerDialog } from "@/components/assets/asset-picker-dialog";
import { 
  Loading03Icon as Loader2, 
  SentIcon as Send, 
  NoteEditIcon as PenSquare, 
  UserMultiple02Icon as Users, 
  Calendar03Icon as Calendar, 
  Image01Icon as ImageIcon, 
  Cancel01Icon as X,
  Upload01Icon as Upload,
  FloppyDiskIcon as Save,
  AlertCircleIcon as AlertCircle
} from "hugeicons-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fromZonedTime } from "date-fns-tz";

const PLATFORM_CHAR_LIMITS: Record<string, { label: string; limit: number; maxMedia: number }> = {
  x: { label: "X", limit: 280, maxMedia: 4 },
  twitter: { label: "Twitter", limit: 280, maxMedia: 4 },
  threads: { label: "Threads", limit: 500, maxMedia: 10 },
  bluesky: { label: "Bluesky", limit: 300, maxMedia: 4 },
  linkedin: { label: "LinkedIn", limit: 3000, maxMedia: 9 },
  instagram: { label: "Instagram", limit: 2200, maxMedia: 10 },
  facebook: { label: "Facebook", limit: 63206, maxMedia: 10 },
  tiktok: { label: "TikTok", limit: 2200, maxMedia: 1 },
  youtube: { label: "YouTube", limit: 5000, maxMedia: 1 },
};

export default function ComposePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftIdParam = searchParams.get("draftId");
  const dateParam = searchParams.get("date");

  const [accounts, setAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Form state
  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [externalUrl, setExternalUrl] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState<ScheduleType>("now");
  const [scheduledDate, setScheduledDate] = useState<string | undefined>(dateParam || undefined);
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prefill date if coming from calendar
  useEffect(() => {
    if (dateParam) {
      setScheduleType("scheduled");
      setScheduledDate(dateParam);
    }
  }, [dateParam]);

  // Load connected active accounts
  useEffect(() => {
    async function loadAccounts() {
      const res = await getConnectedAccounts();
      if (res.accounts) setAccounts(res.accounts);
      setLoadingAccounts(false);
    }
    loadAccounts();
  }, []);

  // Prefill from draft if editing existing draft
  useEffect(() => {
    if (!draftIdParam) return;
    async function loadDraft() {
      const res = await getDraftForCompose(draftIdParam!);
      if (res.draft) {
        setContent(res.draft.content || "");
        const opts = res.draft.platformOptions as any;
        if (opts?.mediaUrls && Array.isArray(opts.mediaUrls)) {
          setMediaUrls(opts.mediaUrls);
        }
        if (opts?.accountId) {
          setSelectedAccountIds([opts.accountId]);
        }
        if (res.draft.scheduledFor) {
          setScheduleType("scheduled");
          const dateObj = new Date(res.draft.scheduledFor);
          setScheduledDate(dateObj.toISOString().split("T")[0]);
          const hh = String(dateObj.getHours()).padStart(2, "0");
          const mm = String(dateObj.getMinutes()).padStart(2, "0");
          setScheduledTime(`${hh}:${mm}`);
        }
      }
    }
    loadDraft();
  }, [draftIdParam]);

  const selectedAccounts = accounts.filter(a => selectedAccountIds.includes(a.id));

  // Dynamic platform limit calculation
  const charCount = content.length;
  const activeLimits = selectedAccounts.map(a => {
    const plat = a.platform?.toLowerCase() || "";
    return {
      platform: a.platform,
      accountName: a.accountName,
      ...(PLATFORM_CHAR_LIMITS[plat] || { label: a.platform, limit: 280, maxMedia: 4 })
    };
  });

  const effectiveCharLimit = activeLimits.length > 0 
    ? Math.min(...activeLimits.map(l => l.limit))
    : 280;

  const maxAllowedMedia = activeLimits.length > 0
    ? Math.min(...activeLimits.map(l => l.maxMedia))
    : 4;

  const exceedsCharLimit = activeLimits.some(l => charCount > l.limit);
  const exceedsMediaLimit = mediaUrls.length > maxAllowedMedia;

  const canSubmit = selectedAccountIds.length > 0 && 
    (content.trim().length > 0 || mediaUrls.length > 0) && 
    !isSubmitting && 
    !isSavingDraft &&
    !exceedsCharLimit;

  const addExternalUrl = () => {
    const url = externalUrl.trim();
    if (url && !mediaUrls.includes(url)) {
      setMediaUrls((prev) => [...prev, url]);
      setExternalUrl("");
    }
  };

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let uploadedCount = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 50MB size limit`);
          continue;
        }
        const { uploadUrl, key } = await requestUploadUrl(file.name, file.type || "application/octet-stream");
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!uploadRes.ok) throw new Error(`Upload of ${file.name} to R2 storage failed`);

        const { asset } = await registerAsset({
          filename: file.name,
          key,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        });

        if (asset?.publicUrl) {
          setMediaUrls((prev) => [...prev, asset.publicUrl]);
          uploadedCount++;
        }
      }
      if (uploadedCount > 0) {
        toast.success(`${uploadedCount} file${uploadedCount === 1 ? "" : "s"} attached`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const handleSaveDraft = async () => {
    if (selectedAccountIds.length === 0) {
      toast.error("Please select at least one account for this draft");
      return;
    }
    if (!content.trim() && mediaUrls.length === 0) {
      toast.error("Please provide content or media for your draft");
      return;
    }

    setIsSavingDraft(true);
    const res = await createManualPost({
      content,
      mediaUrls,
      accountIds: selectedAccountIds,
      scheduleType: "draft",
    });
    setIsSavingDraft(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Saved to drafts queue!");
      router.push("/drafts");
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);

    let scheduledFor: string | undefined;
    if (scheduleType === "scheduled" && scheduledDate) {
      const [year, month, day] = scheduledDate.split("-").map(Number);
      const [hours, minutes] = scheduledTime.split(":").map(Number);
      const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
      const localDate = new Date(year, month - 1, day, hours, minutes, 0);
      const utcDate = fromZonedTime(localDate, tz);
      scheduledFor = utcDate.toISOString();
    }

    const res = await createManualPost({
      content,
      mediaUrls,
      accountIds: selectedAccountIds,
      scheduleType,
      scheduledFor
    });

    setIsSubmitting(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(scheduleType === "now" ? "Posts published successfully!" : "Posts scheduled successfully!");
      setContent("");
      setMediaUrls([]);
      setExternalUrl("");
      setSelectedAccountIds([]);
      router.push(scheduleType === "now" ? "/dashboard" : "/calendar");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compose Post</h1>
          <p className="text-muted-foreground mt-1 text-sm">Write, preview, and publish content across your connected platforms.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleSaveDraft}
          disabled={selectedAccountIds.length === 0 || (!content.trim() && mediaUrls.length === 0) || isSavingDraft || isSubmitting}
          className="self-start gap-1.5"
        >
          {isSavingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save as Draft
        </Button>
      </div>

      {/* Autopilot Discovery Banner */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="text-base">💡</span>
          <span>
            <strong className="text-foreground">Manual Composer:</strong> For ad-hoc posts right now. Want Joey to draft posts on autopilot every day?
          </span>
        </div>
        <Link
          href="/theme-studio"
          className="font-medium text-primary hover:underline shrink-0 inline-flex items-center gap-1"
        >
          Configure a Theme Page →
        </Link>
      </div>

      {/* 1. Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Target Accounts
            {selectedAccountIds.length > 0 && (
              <Badge variant="secondary" className="font-normal text-xs ml-1">
                {selectedAccountIds.length} selected
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Choose the platforms and profiles where you want to publish.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAccounts ? (
            <div className="flex justify-center p-4"><Loader2 className="animate-spin text-zinc-400" /></div>
          ) : (
            <PlatformSelector
              accounts={accounts}
              selectedAccountIds={selectedAccountIds}
              onSelectionChange={setSelectedAccountIds}
            />
          )}
        </CardContent>
      </Card>

      {/* 2. Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <PenSquare className="h-4 w-4" />
              Content & Media
            </span>
            {/* Dynamic Character Counters */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeLimits.map((l) => {
                const over = charCount > l.limit;
                return (
                  <Badge 
                    key={l.accountName || l.platform} 
                    variant={over ? "destructive" : "outline"} 
                    className="text-[11px] font-mono capitalize"
                  >
                    {l.label}: {charCount}/{l.limit}
                  </Badge>
                );
              })}
              {activeLimits.length === 0 && (
                <span className="text-xs text-muted-foreground font-mono">
                  {charCount} / {effectiveCharLimit}
                </span>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="What's on your mind? Share news, insights, or start a discussion..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className={`resize-none transition-colors ${exceedsCharLimit ? "border-destructive focus-visible:ring-destructive" : ""}`}
            />
            {exceedsCharLimit && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Character limit exceeded for one or more selected platforms. Please shorten your message.
              </p>
            )}
          </div>
          
          {/* Media Section */}
          <div 
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={(e) => {
              e.preventDefault();
              void handleFileUpload(e.dataTransfer.files);
            }}
            className="bg-muted/30 p-4 rounded-xl border border-dashed space-y-3 transition-colors hover:border-primary/40"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                Media Attachments
                {mediaUrls.length > 0 && (
                  <span className="text-muted-foreground font-normal text-xs">({mediaUrls.length})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*,video/*"
                  multiple
                  onChange={(e) => void handleFileUpload(e.target.files)}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="h-8 gap-1 text-xs"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Upload File
                </Button>
                <AssetPickerDialog
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                  onSelect={(urls) => {
                    setMediaUrls((prev) => {
                      const existing = new Set(prev);
                      const newUrls = urls.filter((u) => !existing.has(u));
                      return [...prev, ...newUrls];
                    });
                  }}
                />
              </div>
            </div>

            {mediaUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {mediaUrls.map((url, i) => {
                  const isVideo = /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(url);
                  return (
                    <div key={url} className="group relative rounded-lg overflow-hidden border bg-background">
                      {isVideo ? (
                        <div className="h-16 w-20 flex items-center justify-center bg-muted text-[10px] font-semibold">
                          VIDEO
                        </div>
                      ) : (
                        <img
                          src={url}
                          alt=""
                          className="h-16 w-16 object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setMediaUrls((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {exceedsMediaLimit && (
              <p className="text-xs text-amber-500 font-medium">
                Warning: Selected platform allows a maximum of {maxAllowedMedia} media attachments.
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Input
                placeholder="Or paste an external image / video URL..."
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExternalUrl(); } }}
                className="h-8 text-xs bg-background"
              />
              <Button variant="outline" size="sm" onClick={addExternalUrl} disabled={!externalUrl.trim()} className="h-8 text-xs">
                Add URL
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Previews */}
      {selectedAccounts.length > 0 && (content.trim().length > 0 || mediaUrls.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform Previews</CardTitle>
          </CardHeader>
          <CardContent>
            <PlatformPreviews content={content} media={mediaUrls} selectedAccounts={selectedAccounts} />
          </CardContent>
        </Card>
      )}

      {/* 4. Scheduling */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Publish Timing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SchedulePicker
            scheduleType={scheduleType}
            scheduledDate={scheduledDate}
            scheduledTime={scheduledTime}
            onScheduleTypeChange={setScheduleType}
            onDateChange={setScheduledDate}
            onTimeChange={setScheduledTime}
          />
        </CardContent>
      </Card>

      {/* 5. Submit Action */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleSaveDraft}
          disabled={!canSubmit || isSavingDraft}
          size="lg"
          className="w-full sm:w-auto px-6"
        >
          {isSavingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save as Draft
        </Button>
        <Button 
          onClick={handleSubmit} 
          disabled={!canSubmit || isSubmitting} 
          size="lg" 
          className="w-full sm:w-auto px-8 font-semibold"
        >
          {isSubmitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing...</>
          ) : (
            <><Send className="mr-2 h-4 w-4" /> {scheduleType === "now" ? "Publish Now" : "Schedule Post"}</>
          )}
        </Button>
      </div>
    </div>
  );
}
