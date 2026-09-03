'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient, signOut, useSession } from '@/lib/auth-client';
import { 
  UserIcon, 
  Settings02Icon, 
  CreditCardIcon, 
  Logout01Icon,
  Loading03Icon 
} from 'hugeicons-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { toast } from 'sonner';

export function UserButton({ className }: { className?: string }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isPending) {
    return (
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        <Loading03Icon size={14} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors"
      >
        <UserIcon size={14} />
        <span>Sign In</span>
      </Link>
    );
  }

  const user = session.user;
  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user.email.slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out');
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <div className={`relative ${className || ''}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg p-1 hover:bg-accent transition-colors focus:outline-none"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="w-8 h-8 rounded-full bg-[#ffe633]/20 border border-[#ffe633]/30 text-[#ffe633] flex items-center justify-center text-xs font-semibold">
          {initials}
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-popover p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-popover-foreground truncate">{user.name || 'User'}</p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user.email}</p>
          </div>

          <div className="py-1 space-y-0.5">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-xs text-popover-foreground/80 hover:text-popover-foreground rounded-lg hover:bg-accent transition-colors"
            >
              <Settings02Icon size={15} className="text-muted-foreground" />
              <span>Workspace Settings</span>
            </Link>

            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-xs text-popover-foreground/80 hover:text-popover-foreground rounded-lg hover:bg-accent transition-colors"
            >
              <CreditCardIcon size={15} className="text-muted-foreground" />
              <span>Billing & Plan</span>
            </Link>

            <div className="flex items-center justify-between px-3 py-1.5 text-xs text-popover-foreground/80">
              <span className="text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
          </div>

          <div className="pt-1 border-t border-border">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-destructive hover:text-destructive rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              <Logout01Icon size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
