"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useQueryState } from "nuqs";
import type { CalendarViewMode } from "./post-calendar";
import { getCalendarPosts, rescheduleDraft, type CalendarPost } from "@/app/actions/calendar";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, addHours, format } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PostDetailsDialog } from "./post-details-dialog";

// react-big-calendar + react-dnd are heavy; load them only when the calendar renders.
const PostCalendar = dynamic(
  () => import("./post-calendar").then((m) => m.PostCalendar),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col h-full min-h-[640px] rounded-xl border border-border bg-card p-4 space-y-4 animate-pulse">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="flex gap-2">
            <div className="h-8 w-20 bg-muted rounded" />
            <div className="h-8 w-20 bg-muted rounded" />
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2 flex-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border/40 bg-muted/20 min-h-[90px] p-2" />
          ))}
        </div>
      </div>
    ),
  },
);

export function CalendarView() {
  const router = useRouter();
  const [requestedView, setView] = useQueryState("view", { defaultValue: "month" });
  const view: CalendarViewMode = requestedView === "week" || requestedView === "day" ? requestedView : "month";
  const [currentDate, setCurrentDate] = useState(new Date());

  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadPosts() {
      setIsPending(true);

      let start, end;
      if (view === "month") {
        start = startOfWeek(startOfMonth(currentDate));
        end = endOfWeek(endOfMonth(currentDate));
      } else if (view === "week") {
        start = startOfWeek(currentDate);
        end = endOfWeek(currentDate);
      } else {
        start = startOfDay(currentDate);
        end = addHours(start, 24);
      }

      try {
        const res = await getCalendarPosts(start, end);
        if (!ignore) {
          if (res.error) toast.error(res.error);
          else if (res.posts) setPosts(res.posts);
        }
      } catch { if (!ignore) toast.error("Couldn’t load calendar posts. Please try again."); }
      finally { if (!ignore) setIsPending(false); }
    }

    loadPosts();

    return () => {
      ignore = true;
    };
  }, [currentDate, view]);

  const handleCreatePost = useCallback((date: Date) => {
    router.push(`/compose?date=${format(date, "yyyy-MM-dd")}`);
  }, [router]);

  const handleReschedule = useCallback(async (draftId: string, newDate: Date) => {
    try {
    const res = await rescheduleDraft(draftId, newDate);
    if (res.success) {
      toast.success(`Rescheduled for ${newDate.toLocaleString()}`);
      return true;
    } else {
      toast.error(res.error || "Failed to reschedule");
      return false;
    }
    } catch { toast.error("Couldn’t reschedule this post. Please try again."); return false; }
  }, []);

  const handleReload = useCallback(() => {
    setCurrentDate(new Date(currentDate));
  }, [currentDate]);

  return (
    <div className="flex min-w-0 flex-col w-full min-h-[640px] rounded-xl border border-border bg-card p-2 sm:p-4 shadow-xs">
      <PostCalendar
        posts={posts}
        isPending={isPending}
        currentDate={currentDate}
        view={view as CalendarViewMode}
        onViewChange={(v) => setView(v as CalendarViewMode)}
        onDateChange={setCurrentDate}
        onPostClick={setSelectedPost}
        onCreatePost={handleCreatePost}
        onReschedule={handleReschedule}
        onReload={handleReload}
      />

      <PostDetailsDialog
        open={selectedPost !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPost(null);
        }}
        post={selectedPost}
        onRescheduled={() => {
          handleReload();
        }}
        onClickCompose={() => selectedPost?.editUrl && router.push(selectedPost.editUrl)}
      />
    </div>
  );
}
