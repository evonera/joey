'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Sun03Icon, Moon02Icon } from 'hugeicons-react';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={`w-8 h-8 rounded-md bg-secondary/50 border border-border ${className || ''}`} />
    );
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-md bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border transition-colors ${className || ''}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <Sun03Icon size={16} strokeWidth={1.5} />
      ) : (
        <Moon02Icon size={16} strokeWidth={1.5} />
      )}
    </button>
  );
}
