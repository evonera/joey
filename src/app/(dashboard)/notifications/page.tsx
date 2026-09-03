'use client';

import { useState, useEffect, useCallback } from 'react';
import { getNotifications, markAsRead, markAllAsRead } from '@/app/actions/notifications';
import { IconBell, IconCheck, IconAlertTriangle, IconEdit, IconMessageDots, IconBroadcast } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const fetchNotifs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getNotifications({ limit: 100, unreadOnly: filter === 'unread' });
      if (res.notifications) {
        setNotifications(res.notifications);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
    fetchNotifs();
  };

  const handleNotificationClick = async (notif: any) => {
    if (!notif.isRead) {
      await markAsRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
    }
    if (notif.link) {
      router.push(notif.link);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'draft_ready': return <IconEdit className="h-6 w-6 text-primary" />;
      case 'engagement_reply_needed': return <IconMessageDots className="h-6 w-6 text-primary" />;
      case 'api_failure': return <IconAlertTriangle className="h-6 w-6 text-amber-500" />;
      case 'publish_success': return <IconBroadcast className="h-6 w-6 text-green-500" />;
      case 'publish_failed': return <IconAlertTriangle className="h-6 w-6 text-red-500" />;
      default: return <IconBell className="h-6 w-6 text-muted-foreground" />;
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto pb-24">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">Stay updated with your social media automation</p>
        </div>
        {notifications.some(n => !n.isRead) && (
          <button
            onClick={handleMarkAllAsRead}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <IconCheck className="h-4 w-4" />
            Mark all as read
          </button>
        )}
      </div>

      <div className="flex space-x-1 border-b border-border mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === 'all' 
              ? 'border-primary text-primary font-semibold' 
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === 'unread' 
              ? 'border-primary text-primary font-semibold' 
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Unread
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center">
          <div className="h-8 w-8 rounded-full border-4 border-muted border-t-primary animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
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
              onClick={() => handleNotificationClick(notif)}
              className={`p-5 rounded-xl border transition-colors cursor-pointer flex gap-4 ${
                !notif.isRead 
                  ? 'bg-card border-primary/30 shadow-xs' 
                  : 'bg-muted/40 border-border'
              } hover:border-primary/50`}
            >
              <div className="flex-shrink-0 mt-1">
                {getIcon(notif.type)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={`text-base font-medium ${!notif.isRead ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                  {notif.title}
                </h4>
                <p className={`mt-1 text-sm ${!notif.isRead ? 'text-foreground/90' : 'text-muted-foreground'}`}>
                  {notif.body}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                </p>
              </div>
              {!notif.isRead && (
                <div className="flex-shrink-0 flex items-center">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
