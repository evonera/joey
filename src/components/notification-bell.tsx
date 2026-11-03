'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { IconBell, IconCheck, IconAlertTriangle, IconEdit, IconMessageDots, IconBroadcast } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { getNotifications, getUnreadNotificationCount, markAsRead, markAllAsRead } from '@/app/actions/notifications';
import { useVisiblePolling } from '@/hooks/use-visible-polling';
import Link from 'next/link';
import { useLiveblocksConfig } from '@/components/collaboration/liveblocks-provider';
import { LiveblocksInboxList, LiveblocksInboxCount, LiveblocksUnreadDot } from '@/components/collaboration/liveblocks-inbox';

function useNotificationPolling(initialUnreadCount: number, isOpen: boolean, showSystemList: boolean) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchNotifications = useCallback(async (signal: AbortSignal) => {
    try {
      if (showSystemList) {
        const res = await getNotifications({ limit: 5 });
        if (res.error) throw new Error(res.error);
        if (signal.aborted) return;
        setNotifications(res.notifications ?? []);
        if (res.unreadCount !== undefined) setUnreadCount(res.unreadCount);
      } else {
        const res = await getUnreadNotificationCount();
        if (res.error) throw new Error(res.error);
        if (signal.aborted) return;
        if (res.count !== undefined) setUnreadCount(res.count);
      }
      setLoadError(null);
    } catch (err) {
      if (!signal.aborted) setLoadError('Couldn’t refresh notifications. Retrying automatically.');
      throw err;
    }
  }, [showSystemList]);
  // The server already supplies the initial badge. Fetch full rows only when opened.
  useVisiblePolling(fetchNotifications, showSystemList ? 30_000 : 120_000, { immediate: isOpen });

  return { unreadCount, setUnreadCount, notifications, setNotifications, loadError };
}

function getIcon(type: string) {
    switch (type) {
      case 'draft_ready': return <IconEdit className="h-5 w-5 text-amber-500 dark:text-amber-400" />;
      case 'engagement_reply_needed': return <IconMessageDots className="h-5 w-5 text-amber-500 dark:text-amber-400" />;
      case 'api_failure': return <IconAlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'publish_success': return <IconBroadcast className="h-5 w-5 text-green-500" />;
      case 'publish_failed': return <IconAlertTriangle className="h-5 w-5 text-red-500" />;
      default: return <IconBell className="h-5 w-5 text-zinc-500" />;
    }
  }

type NotificationItem = NonNullable<Awaited<ReturnType<typeof getNotifications>>["notifications"]>[number];

function SystemNotifications({ notifications, unreadCount, isConfigured, loadError, onMarkAll, onSelect }: {
  notifications: NotificationItem[]; unreadCount: number; isConfigured: boolean; loadError: string | null;
  onMarkAll: (event: React.MouseEvent) => Promise<void>; onSelect: (notification: NotificationItem) => Promise<void>;
}) {
  return (
            <div className="max-h-[60vh] overflow-y-auto">
              {unreadCount > 0 && isConfigured && (
                <div className="p-2 px-4 bg-muted/20 border-b border-border flex justify-end">
                  <button
                    onClick={onMarkAll}
                    className="text-[11px] text-muted-foreground hover:text-foreground font-medium flex items-center transition-colors cursor-pointer"
                  >
                    <IconCheck className="h-3 w-3 mr-1" />
                    Mark all read
                  </button>
                </div>
              )}
              {loadError && <p role="status" className="p-4 text-sm text-amber-600 dark:text-amber-400">{loadError}</p>}
              {notifications.length === 0 && !loadError ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No notifications yet.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => onSelect(notif)}
                      className={`p-4 flex gap-3 cursor-pointer hover:bg-muted/50 transition-colors ${!notif.isRead ? 'bg-amber-500/5' : ''}`}
                    >
                      <div className="flex-shrink-0 mt-1">
                        {getIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${!notif.isRead ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                          {notif.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {notif.body}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1.5">
                          {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {!notif.isRead && (
                        <div className="flex-shrink-0 flex items-center">
                          <div className="h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400"></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
  );
}

export function NotificationBell({ initialUnreadCount = 0 }: { initialUnreadCount?: number }) {
  const { isConfigured } = useLiveblocksConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'system' | 'team'>('system');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const showSystemList = isOpen && (!isConfigured || activeTab === 'system');
  const { unreadCount, setUnreadCount, notifications, setNotifications, loadError } = useNotificationPolling(initialUnreadCount, isOpen, showSystemList);

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
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
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


  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={handleToggle}
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="relative p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <IconBell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 dark:bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500 dark:bg-amber-400"></span>
          </span>
        ) : (
          <LiveblocksUnreadDot />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-popover text-popover-foreground rounded-xl shadow-xl border border-border z-50 overflow-hidden">
          {isConfigured ? (
            <div className="flex border-b border-border bg-muted/30">
              <button 
                onClick={() => setActiveTab('system')}
                className={`flex-1 py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'system' 
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400 bg-background/50' 
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>Updates</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setActiveTab('team')}
                className={`flex-1 py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'team' 
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400 bg-background/50' 
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>Team & Mentions</span>
                <LiveblocksInboxCount />
              </button>
            </div>
          ) : (
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/40">
              <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <button 
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center transition-colors cursor-pointer"
                >
                  <IconCheck className="h-3 w-3 mr-1" />
                  Mark all read
                </button>
              )}
            </div>
          )}
          
          {isConfigured && activeTab === 'team' ? (
            <LiveblocksInboxList onNotificationClick={() => setIsOpen(false)} />
          ) : (
            <SystemNotifications notifications={notifications} unreadCount={unreadCount} isConfigured={isConfigured} loadError={loadError} onMarkAll={handleMarkAllAsRead} onSelect={handleNotificationClick} />
          )}
          
          <div className="p-3 border-t border-border bg-muted/40 text-center">
            <Link 
              href="/notifications" 
              onClick={() => setIsOpen(false)}
              className="text-sm text-foreground hover:text-amber-600 dark:hover:text-amber-400 font-medium block w-full transition-colors"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
