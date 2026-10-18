'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getNotifications, markAsRead, markAllAsRead } from '@/app/actions/notifications';
import { IconBell, IconCheck, IconAlertTriangle, IconEdit, IconMessageDots, IconBroadcast } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const requestId = useRef(0);
  const router = useRouter();

  const fetchNotifs = useCallback(async () => {
    const request = ++requestId.current;
    setIsLoading(true);
    try {
      const res = await getNotifications({ limit: 100, unreadOnly: filter === 'unread' });
      if (request !== requestId.current) return;
      if (res.error) { setError(res.error); return; }
      setNotifications(res.notifications ?? []);
      setError(null);
    } catch {
      if (request === requestId.current) setError('Could not load notifications. Please retry.');
    } finally {
      if (request === requestId.current) setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchNotifs();
    return () => { requestId.current += 1; };
  }, [fetchNotifs]);

  const persistRead = async (id?: string) => {
    if (marking) return false;
    const ids = new Set(id ? [id] : notifications.map(n => n.id));
    setMarking(true);
    try {
      const res = id ? await markAsRead(id) : await markAllAsRead();
      if (!res.success) throw new Error(res.error ?? 'Could not mark notifications as read');
      // Do not allow an earlier fetch to undo a confirmed mutation.
      requestId.current += 1;
      setIsLoading(false);
      setNotifications(prev => filter === 'unread'
        ? prev.filter(n => !ids.has(n.id))
        : prev.map(n => ids.has(n.id) ? { ...n, isRead: true } : n));
      setError(null);
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not mark notifications as read';
      setError(message);
      toast.error(message);
      return false;
    } finally { setMarking(false); }
  };

  const handleMarkAllAsRead = async () => {
    if (await persistRead()) toast.success('All notifications marked as read');
  };

  const handleMarkSingleRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (await persistRead(id)) toast.success('Marked as read');
  };

  const handleNotificationClick = async (notif: any) => {
    if (!notif.isRead && !(await persistRead(notif.id))) return;
    if (notif.link) router.push(notif.link);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'draft_ready': return <IconEdit className="h-5 w-5 text-primary" />;
      case 'engagement_reply_needed': return <IconMessageDots className="h-5 w-5 text-primary" />;
      case 'api_failure': return <IconAlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'publish_success': return <IconBroadcast className="h-5 w-5 text-emerald-500" />;
      case 'publish_failed': return <IconAlertTriangle className="h-5 w-5 text-destructive" />;
      default: return <IconBell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activity and operational alerts across your automated workflows.
          </p>
        </div>
        {hasUnread && (
          <Button
            variant="outline"
            size="sm"
            disabled={marking}
            onClick={handleMarkAllAsRead}
            className="text-xs gap-1.5"
          >
            <IconCheck className="h-3.5 w-3.5" />
            Mark all as read
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between border-b border-border pb-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unread')}>
          <TabsList className="grid grid-cols-2 w-48">
            <TabsTrigger disabled={marking} value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger disabled={marking} value="unread" className="text-xs">Unread</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"><span>{error}</span><Button variant="outline" size="sm" disabled={isLoading} onClick={() => void fetchNotifs()}>Retry notifications</Button></div>}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-5 rounded-xl border border-border/50 bg-card/60 animate-pulse flex gap-4">
              <div className="size-6 rounded-full bg-muted shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2 bg-muted rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 && !error ? (
        <div className="text-center py-16 border rounded-xl border-dashed border-border bg-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
            <IconBell className="h-6 w-6 text-primary" />
          </div>
          <h3 className="mt-2 text-sm font-semibold text-foreground">No notifications</h3>
          <p className="mt-1 text-sm text-muted-foreground">You&apos;re all caught up!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              role="button"
              tabIndex={0}
              onClick={() => handleNotificationClick(notif)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleNotificationClick(notif);
                }
              }}
              className={`p-5 rounded-xl border transition-all cursor-pointer flex items-start gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                !notif.isRead
                  ? 'bg-card border-primary/30 shadow-xs'
                  : 'bg-muted/30 border-border opacity-80 hover:opacity-100'
              } hover:border-primary/50`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getIcon(notif.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className={`text-sm font-medium ${!notif.isRead ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                    {notif.title}
                  </h4>
                  {!notif.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={marking}
                      onClick={(e) => handleMarkSingleRead(e, notif.id)}
                      className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                    >
                      Mark read
                    </Button>
                  )}
                </div>
                <p className={`mt-1 text-xs sm:text-sm ${!notif.isRead ? 'text-foreground/90' : 'text-muted-foreground'}`}>
                  {notif.body}
                </p>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                </p>
              </div>
              {!notif.isRead && (
                <div className="flex-shrink-0 flex items-center pt-1">
                  <span className="size-2 rounded-full bg-primary" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
