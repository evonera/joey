'use client';

import { useState, useEffect } from "react";
import { useQueryState } from "nuqs";
import { PostCalendar } from "./post-calendar";
import { getCalendarPosts, CalendarPost } from "@/app/actions/calendar";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function CalendarView() {
  const router = useRouter();
  const [view, setView] = useQueryState("view", { defaultValue: "month" });
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadPosts() {
      setIsPending(true);
      
      // Calculate the date range based on view
      let start, end;
      if (view === "month") {
        start = startOfWeek(startOfMonth(currentDate));
        end = endOfWeek(endOfMonth(currentDate));
      } else {
        start = startOfWeek(currentDate);
        end = endOfWeek(currentDate);
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

  const handlePostClick = (post: CalendarPost) => {
    // Navigate to a details page or open an edit modal
    // For now we could just log it or route to compose
    console.log("Clicked post:", post);
  };

  const handleCreatePost = (date: Date) => {
    // Navigate to composer, prepopulating date if possible
    // (MVP: just navigate to /compose)
    router.push('/compose');
  };

  return (
    <div className="flex flex-col overflow-hidden bg-background h-full">
      <div className="flex-1 p-6 h-[calc(100vh-100px)]">
        <PostCalendar
          posts={posts}
          isPending={isPending}
          currentDate={currentDate}
          view={view as "month" | "week"}
          onViewChange={setView}
          onDateChange={setCurrentDate}
          onPostClick={handlePostClick}
          onCreatePost={handleCreatePost}
        />
      </div>
    </div>
  );
}
