"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarPost } from "@/app/actions/calendar";
import { rescheduleDraft } from "@/app/actions/calendar";
import { toast } from "sonner";

interface PostDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: CalendarPost | null;
  onRescheduled?: () => void;
  onClickCompose?: () => void;
}

export function PostDetailsDialog({ open, onOpenChange, post, onRescheduled, onClickCompose }: PostDetailsDialogProps) {
  const [dateTime, setDateTime] = useState<string>("");

  useEffect(() => {
    if (post) {
      const local = new Date(post.start);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDateTime(
        `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`
      );
    }
  }, [post]);

  const isPublished = post?.status === "published";

  async function handleReschedule() {
    if (!post || !dateTime) return;
    const target = new Date(dateTime);
    const res = await rescheduleDraft(post.id, target);
    if (res.success) {
      toast.success(`Rescheduled for ${target.toLocaleString()}`);
      onRescheduled?.();
      onOpenChange(false);
    } else {
      toast.error(res.error || "Failed to reschedule");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Post details</DialogTitle>
        </DialogHeader>

        {post ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">Status</p>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  isPublished
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                }`}
              >
                {post.status}
              </span>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">Platform</p>
              <p className="text-sm font-medium">{post.platform}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">Content</p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3">
                {post.title}
              </p>
            </div>

            {post.accountName && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">Account</p>
                <p className="text-sm font-medium">{post.accountName}</p>
              </div>
            )}

            {!isPublished && (
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1 block" htmlFor="post-datetime">
                  Schedule
                </label>
                <input
                  id="post-datetime"
                  type="datetime-local"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No post selected.</p>
        )}

        <DialogFooter className="gap-2">
          {!isPublished && post && (
            <Button onClick={handleReschedule} className="mr-auto">
              Reschedule
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!isPublished && onClickCompose && (
            <Button variant="ghost" onClick={onClickCompose}>
              Edit in Composer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}