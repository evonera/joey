"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useQueryState } from "nuqs";
import type { CalendarViewMode } from "./post-calendar";
import { getCalendarPosts, rescheduleDraft, type CalendarPost } from "@/app/actions/calendar";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, format } from "date-fns";
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
  const [mobileDate, setMobileDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadPosts() {
      setIsPending(true);

      // The mobile agenda always shows the month, even when a desktop day/week
      // view remains in the URL after resizing or opening a shared link.
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));

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
  }, [currentDate]);

  const handleCreatePost = useCallback((date: Date) => {
    const day = format(date, "yyyy-MM-dd");
    router.push(`/compose?date=${day}`);
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

  const mobileMonth = format(currentDate, "yyyy-MM");
  const mobilePosts = posts
    .filter((post) => format(new Date(post.start), "yyyy-MM") === mobileMonth)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  function navigateMobileMonth(delta: number) {
    const next = addMonths(currentDate, delta);
    setCurrentDate(next);
    setMobileDate(format(next, "yyyy-MM-dd"));
  }

  return (
    <div className="flex min-w-0 flex-col w-full min-h-[640px] rounded-xl border border-border bg-card p-2 sm:p-4 shadow-xs">
      <div className="space-y-4 sm:hidden" aria-label="Mobile post agenda">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => navigateMobileMonth(-1)} aria-label="Previous month" className="rounded-lg border px-3 py-2">←</button>
          <h2 className="text-base font-semibold">{format(currentDate, "MMMM yyyy")}</h2>
          <button type="button" onClick={() => navigateMobileMonth(1)} aria-label="Next month" className="rounded-lg border px-3 py-2">→</button>
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-background p-3">
          <label className="min-w-0 flex-1 text-xs font-medium">Post date<input type="date" value={mobileDate} onChange={(event) => setMobileDate(event.target.value)} className="mt-1 block w-full rounded-md border bg-background px-2 py-2 text-sm" /></label>
          <button type="button" onClick={() => handleCreatePost(new Date(`${mobileDate}T12:00:00`))} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Create post</button>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Posts this month</h3>
          {isPending ? <p role="status" className="text-sm text-muted-foreground">Loading posts…</p> : mobilePosts.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No posts here yet. Choose a date above to start a draft.</p> :
            mobilePosts.map((post) => <button key={post.id} type="button" onClick={() => setSelectedPost(post)} className="block w-full rounded-xl border bg-background p-3 text-left hover:border-primary/50"><span className="block text-xs text-muted-foreground">{format(new Date(post.start), "EEE, MMM d · h:mm a")}</span><span className="mt-1 block font-medium">{post.title}</span><span className="mt-1 block text-xs capitalize text-muted-foreground">{post.platform} · {post.status.replaceAll("_", " ")}</span></button>)}
        </div>
      </div>
      <div className="hidden sm:block"><PostCalendar
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
      /></div>

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
