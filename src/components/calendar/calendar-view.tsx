"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryState } from "nuqs";
import { PostCalendar, type CalendarViewMode } from "./post-calendar";
import { getCalendarPosts, rescheduleDraft, type CalendarPost } from "@/app/actions/calendar";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, addHours } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PostDetailsDialog } from "./post-details-dialog";

export function CalendarView() {
  const router = useRouter();
  const [view, setView] = useQueryState("view", { defaultValue: "month" });
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

      const res = await getCalendarPosts(start, end);

      if (!ignore) {
        if (res.error) {
          toast.error(res.error);
        } else if (res.posts) {
          setPosts(res.posts);
        }
        setIsPending(false);
      }
    }

    loadPosts();

    return () => {
      ignore = true;
    };
  }, [currentDate, view]);

  const handleCreatePost = useCallback(() => {
    router.push("/compose");
  }, [router]);

  const handleReschedule = useCallback(async (draftId: string, newDate: Date) => {
    const res = await rescheduleDraft(draftId, newDate);
    if (res.success) {
      toast.success(`Rescheduled for ${newDate.toLocaleString()}`);
      return true;
    } else {
      toast.error(res.error || "Failed to reschedule");
      return false;
    }
  }, []);

  const handleReload = useCallback(() => {
    setCurrentDate(new Date(currentDate));
  }, [currentDate]);

  return (
    <div className="flex flex-col overflow-hidden bg-background h-full">
      <div className="flex-1 p-6 h-[calc(100vh-100px)]">
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
      </div>

      <PostDetailsDialog
        open={selectedPost !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPost(null);
        }}
        post={selectedPost}
        onRescheduled={() => {
          handleReload();
        }}
        onClickCompose={() => router.push("/compose")}
      />
    </div>
  );
}