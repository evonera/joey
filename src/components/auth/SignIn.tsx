'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { 
  Mail01Icon, 
  SecurityLockIcon, 
  ViewIcon, 
  ViewOffIcon, 
  Loading03Icon, 
  ArrowRight01Icon,
  AlertCircleIcon 
} from 'hugeicons-react';
import { toast } from 'sonner';

export function SignIn({ callbackUrl = '/onboarding' }: { callbackUrl?: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [oauthLoading, setOauthLoading] = React.useState<'github' | 'google' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message || 'Failed to sign in. Please check your credentials.');
        return;
      }

      toast.success('Signed in successfully');
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'github' | 'google') => {
    setError(null);
    setOauthLoading(provider);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: callbackUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to sign in with ${provider}.`);
      setOauthLoading(null);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-xl border border-white/[0.08] bg-[#131211] p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#ffe633]/10 text-[#ffe633] mb-2 border border-[#ffe633]/20">
            <SecurityLockIcon size={20} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Welcome to Joey</h1>
          <p className="text-xs text-white/50">Autonomous social media agent & editorial studio</p>
        </div>

        {/* Social Auth */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleOAuth('github')}
            disabled={loading || oauthLoading !== null}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-xs font-medium text-white hover:bg-white/[0.06] hover:border-white/[0.15] transition-all disabled:opacity-50"
          >
            {oauthLoading === 'github' ? (
              <Loading03Icon size={14} className="animate-spin" />
            ) : (
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            )}
            GitHub
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={loading || oauthLoading !== null}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-xs font-medium text-white hover:bg-white/[0.06] hover:border-white/[0.15] transition-all disabled:opacity-50"
          >
            {oauthLoading === 'google' ? (
              <Loading03Icon size={14} className="animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"/>
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"/>
                <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"/>
              </svg>
            )}
            Google
          </button>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/[0.08]" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
            <span className="bg-[#131211] px-2 text-white/40">or continue with email</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertCircleIcon size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-white/70">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 pl-9 text-xs text-white placeholder-white/20 outline-none focus:border-[#ffe633]/60 focus:ring-1 focus:ring-[#ffe633]/60 transition-all"
              />
              <Mail01Icon size={14} className="absolute left-3 top-3 text-white/30" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-white/70">
                Password
              </label>
              <Link 
                href="/forgot-password" 
                className="text-[11px] text-[#ffe633] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 pl-9 pr-9 text-xs text-white placeholder-white/20 outline-none focus:border-[#ffe633]/60 focus:ring-1 focus:ring-[#ffe633]/60 transition-all"
              />
              <SecurityLockIcon size={14} className="absolute left-3 top-3 text-white/30" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-white/30 hover:text-white transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <ViewOffIcon size={14} /> : <ViewIcon size={14} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || oauthLoading !== null}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#ffe633] px-4 py-2.5 text-xs font-semibold text-[#0a0908] hover:bg-[#f5dc2e] transition-all shadow-[0_0_20px_0_rgba(255,230,51,0.2)] disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loading03Icon size={14} className="animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight01Icon size={14} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-white/40">
          Don't have an account?{' '}
          <Link href="/signup" className="text-[#ffe633] font-medium hover:underline">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
