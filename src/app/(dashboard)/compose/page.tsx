'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getConnectedAccounts } from "@/app/actions/zernio";
import { createManualPost } from "@/app/actions/compose";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PlatformSelector } from "@/components/compose/platform-selector";
import { SchedulePicker, type ScheduleType } from "@/components/compose/schedule-picker";
import { PlatformPreviews } from "@/components/compose/platform-previews";
import { Loader2, Send, PenSquare, Users, Calendar, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ComposePage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Form state
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState(""); // Simplified for MVP: just a direct URL input
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState<ScheduleType>("now");
  const [scheduledDate, setScheduledDate] = useState<string>();
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadAccounts() {
      const res = await getConnectedAccounts();
      if (res.accounts) setAccounts(res.accounts);
      setLoadingAccounts(false);
    }
    loadAccounts();
  }, []);

  const selectedAccounts = accounts.filter(a => selectedAccountIds.includes(a.id));
  const mediaUrls = mediaUrl.trim() ? [mediaUrl.trim()] : [];

  const charCount = content.length;
  const charLimit = 280; // Basic check

  const canSubmit = selectedAccountIds.length > 0 && (content.trim().length > 0) && charCount <= charLimit && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);

    let scheduledFor: string | undefined;
    if (scheduleType === "scheduled" && scheduledDate) {
      const date = new Date(`${scheduledDate}T${scheduledTime}:00.000Z`);
      scheduledFor = date.toISOString();
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
      setMediaUrl("");
      setSelectedAccountIds([]);
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
          
          <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-dashed space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ImageIcon className="h-4 w-4 text-zinc-500" />
              Attach Media URL
            </div>
            <Input 
              placeholder="https://example.com/image.jpg" 
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className="bg-white dark:bg-zinc-950"
            />
            <p className="text-xs text-zinc-500">For the MVP, provide a direct public URL to an image.</p>
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
