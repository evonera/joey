'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getConnectedAccounts } from "@/app/actions/zernio";
import { createManualPost } from "@/app/actions/compose";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PlatformSelector } from "@/components/compose/platform-selector";
import { SchedulePicker, type ScheduleType } from "@/components/compose/schedule-picker";
import { PlatformPreviews } from "@/components/compose/platform-previews";
import { AssetPickerDialog } from "@/components/assets/asset-picker-dialog";
import { Loading03Icon as Loader2, SentIcon as Send, NoteEditIcon as PenSquare, UserMultiple02Icon as Users, Calendar03Icon as Calendar, Image01Icon as ImageIcon, Cancel01Icon as X } from "hugeicons-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fromZonedTime } from "date-fns-tz";

export default function ComposePage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Form state
  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [externalUrl, setExternalUrl] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState<ScheduleType>("now");
  const [scheduledDate, setScheduledDate] = useState<string>();
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    async function loadAccounts() {
      const res = await getConnectedAccounts();
      if (res.accounts) setAccounts(res.accounts);
      setLoadingAccounts(false);
    }
    loadAccounts();
  }, []);

  const selectedAccounts = accounts.filter(a => selectedAccountIds.includes(a.id));

  const charCount = content.length;
  const charLimit = 280;

  const canSubmit = selectedAccountIds.length > 0 && (content.trim().length > 0) && !isSubmitting;

  const addExternalUrl = () => {
    const url = externalUrl.trim();
    if (url && !mediaUrls.includes(url)) {
      setMediaUrls((prev) => [...prev, url]);
      setExternalUrl("");
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
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compose Post</h1>
        <p className="text-muted-foreground mt-1">Write, preview, and publish content across your platforms.</p>
      </div>

      {/* 1. Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Select Accounts
            {selectedAccountIds.length > 0 && (
              <span className="text-muted-foreground font-normal">({selectedAccountIds.length} selected)</span>
            )}
          </CardTitle>
          <CardDescription>Choose where you want this post to be published.</CardDescription>
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
          <CardTitle className="flex items-center gap-2 text-base">
            <PenSquare className="h-4 w-4" />
            Content & Media
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="What's on your mind?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <div className="flex justify-end">
              <span className={`text-xs ${charCount > charLimit ? "text-red-500" : "text-zinc-500"}`}>
                {charCount} / {charLimit}
              </span>
            </div>
          </div>
          
          {/* Media Section */}
          <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-dashed space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="h-4 w-4 text-zinc-500" />
                Media
                {mediaUrls.length > 0 && (
                  <span className="text-muted-foreground font-normal">({mediaUrls.length})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
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
              <div className="flex flex-wrap gap-2">
                {mediaUrls.map((url, i) => (
                  <div key={url} className="group relative">
                    {url.match(/\.(png|jpe?g|gif|webp|svg)/i) ? (
                      <img
                        src={url}
                        alt=""
                        className="h-16 w-16 object-cover rounded-lg border"
                      />
                    ) : (
                      <div className="h-16 w-16 flex items-center justify-center bg-muted rounded-lg border">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <button
                      onClick={() => setMediaUrls((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Input
                placeholder="Or paste an external URL..."
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExternalUrl(); } }}
                className="bg-white dark:bg-zinc-950"
              />
              <Button variant="outline" size="sm" onClick={addExternalUrl} disabled={!externalUrl.trim()}>
                Add
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
            When to Publish
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
      <div className="flex justify-end pt-4">
        <Button onClick={handleSubmit} disabled={!canSubmit} size="lg" className="w-full sm:w-auto px-8">
          {isSubmitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
          ) : (
            <><Send className="mr-2 h-4 w-4" /> {scheduleType === "now" ? "Publish Now" : "Schedule Post"}</>
          )}
        </Button>
      </div>
    </div>
  );
}
