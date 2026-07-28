'use client';

import { useState, useEffect } from 'react';
import { getNotifications, markAsRead, markAllAsRead } from '@/app/actions/notifications';
import { IconBell, IconCheck, IconAlertTriangle, IconEdit, IconMessageDots, IconBroadcast } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const fetchNotifs = async () => {
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
  };

  useEffect(() => {
    fetchNotifs();
  }, [filter]);

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
      case 'draft_ready': return <IconEdit className="h-6 w-6 text-indigo-500" />;
      case 'engagement_reply_needed': return <IconMessageDots className="h-6 w-6 text-blue-500" />;
      case 'api_failure': return <IconAlertTriangle className="h-6 w-6 text-amber-500" />;
      case 'publish_success': return <IconBroadcast className="h-6 w-6 text-green-500" />;
      case 'publish_failed': return <IconAlertTriangle className="h-6 w-6 text-red-500" />;
      default: return <IconBell className="h-6 w-6 text-zinc-500" />;
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-1">Updates and alerts for your account</p>
        </div>
        
        <button
          onClick={handleMarkAllAsRead}
          className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors"
        >
          <IconCheck className="mr-1.5 h-4 w-4" />
          Mark all as read
        </button>
      </div>

      <div className="flex space-x-1 border-b border-zinc-200 dark:border-zinc-800 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === 'all' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === 'unread' 
              ? 'border-indigo-600 text-indigo-600' 
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          Unread
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center">
          <div className="h-8 w-8 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 border rounded-xl border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 mb-4">
            <IconBell className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">No notifications</h3>
          <p className="mt-1 text-sm text-zinc-500">You're all caught up!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <div 
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={`p-5 rounded-xl border transition-colors cursor-pointer flex gap-4 ${
                !notif.isRead 
                  ? 'bg-white dark:bg-zinc-900 border-indigo-100 dark:border-indigo-900/50 shadow-sm' 
                  : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800'
              } hover:border-indigo-200 dark:hover:border-indigo-800`}
            >
              <div className="flex-shrink-0 mt-1">
                {getIcon(notif.type)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={`text-base font-medium ${!notif.isRead ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {notif.title}
                </h4>
                <p className={`mt-1 text-sm ${!notif.isRead ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-500'}`}>
                  {notif.body}
                </p>
                <p className="text-xs text-zinc-400 mt-2">
                  {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                </p>
              </div>
              {!notif.isRead && (
                <div className="flex-shrink-0 flex items-center">
                  <div className="h-2.5 w-2.5 rounded-full bg-indigo-600"></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
