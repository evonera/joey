'use client';

import { useState, useEffect, useRef } from 'react';
import { IconBell, IconCheck, IconAlertTriangle, IconEdit, IconMessageDots, IconBroadcast } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { getNotifications, markAsRead, markAllAsRead } from '@/app/actions/notifications';
import Link from 'next/link';

export function NotificationBell({ initialUnreadCount = 0 }: { initialUnreadCount?: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = async () => {
    try {
      const res = await getNotifications({ limit: 5 });
      if (res.notifications) {
        setNotifications(res.notifications);
        if (res.unreadCount !== undefined) {
          setUnreadCount(res.unreadCount);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // Initial fetch if opened or just periodically
    fetchNotifications();

    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000); // 30s auto-refresh

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchNotifications();
    }
  };

  const handleNotificationClick = async (notif: any) => {
    setIsOpen(false);
    
    if (!notif.isRead) {
      // Optimistically update
      setUnreadCount(Math.max(0, unreadCount - 1));
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
      await markAsRead(notif.id);
    }

    if (notif.link) {
      router.push(notif.link);
    }
  };

  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Optimistic update
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    
    await markAllAsRead();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'draft_ready': return <IconEdit className="h-5 w-5 text-indigo-500" />;
      case 'engagement_reply_needed': return <IconMessageDots className="h-5 w-5 text-blue-500" />;
      case 'api_failure': return <IconAlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'publish_success': return <IconBroadcast className="h-5 w-5 text-green-500" />;
      case 'publish_failed': return <IconAlertTriangle className="h-5 w-5 text-red-500" />;
      default: return <IconBell className="h-5 w-5 text-zinc-500" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={handleToggle}
        className="relative p-2 rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <IconBell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 z-50 overflow-hidden">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
            <h3 className="font-semibold text-sm text-zinc-900 dark:text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllAsRead}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center"
              >
                <IconCheck className="h-3 w-3 mr-1" />
                Mark all read
              </button>
            )}
          </div>
          
          <div className="max-h-[60vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-sm">
                No notifications yet.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {notifications.map((notif) => (
                  <div 
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-4 flex gap-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${!notif.isRead ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
                  >
                    <div className="flex-shrink-0 mt-1">
                      {getIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${!notif.isRead ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
                        {notif.title}
                      </p>
                      <p className="text-sm text-zinc-500 truncate mt-0.5">
                        {notif.body}
                      </p>
                      <p className="text-xs text-zinc-400 mt-1.5">
                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!notif.isRead && (
                      <div className="flex-shrink-0 flex items-center">
                        <div className="h-2 w-2 rounded-full bg-indigo-600"></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-center">
            <Link 
              href="/notifications" 
              onClick={() => setIsOpen(false)}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium block w-full"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
