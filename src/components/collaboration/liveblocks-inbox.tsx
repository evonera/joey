"use client";

import { useInboxNotifications, useUnreadInboxNotificationsCount } from "@liveblocks/react";
import { InboxNotification } from "@liveblocks/react-ui";
import { useLiveblocksConfig } from "./liveblocks-provider";
import { Loader2, Sparkles } from "lucide-react";

export function LiveblocksInboxCount() {
  const { isConfigured } = useLiveblocksConfig();
  if (!isConfigured) return null;
  return <InnerInboxCount />;
}

function InnerInboxCount() {
  const { count } = useUnreadInboxNotificationsCount();
  if (!count || count <= 0) return null;
  return (
    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">
      {count}
    </span>
  );
}

export function LiveblocksUnreadDot() {
  const { isConfigured } = useLiveblocksConfig();
  if (!isConfigured) return null;
  return <InnerUnreadDot />;
}

function InnerUnreadDot() {
  const { count } = useUnreadInboxNotificationsCount();
  if (!count || count <= 0) return null;
  return (
    <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ffe633] opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ffe633]"></span>
    </span>
  );
}

export function LiveblocksInboxList({ onNotificationClick }: { onNotificationClick?: () => void }) {
  const { isConfigured } = useLiveblocksConfig();
  if (!isConfigured) return null;
  return <InnerInboxList onNotificationClick={onNotificationClick} />;
}

function InnerInboxList({ onNotificationClick }: { onNotificationClick?: () => void }) {
  const { inboxNotifications, isLoading } = useInboxNotifications();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground gap-2 text-xs">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Loading team notifications...</span>
      </div>
    );
  }

  if (!inboxNotifications || inboxNotifications.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground text-xs">
        <Sparkles className="mx-auto mb-2 h-4 w-4 text-muted-foreground" />
        No team mentions or comment replies yet.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border overflow-y-auto max-h-[50vh]" onClick={onNotificationClick}>
      {inboxNotifications.map((notif) => (
        <InboxNotification key={notif.id} inboxNotification={notif} />
      ))}
    </div>
  );
}
