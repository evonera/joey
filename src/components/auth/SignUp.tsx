'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { 
  Mail01Icon, 
  SecurityLockIcon, 
  UserIcon,
  Building01Icon,
  ViewIcon, 
  ViewOffIcon, 
  Loading03Icon, 
  ArrowRight01Icon,
  AlertCircleIcon 
} from 'hugeicons-react';
import { toast } from 'sonner';

export function SignUp({ callbackUrl = '/onboarding' }: { callbackUrl?: string }) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [workspaceName, setWorkspaceName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Please fill out all required fields.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const { error: signUpError } = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message || 'Failed to create account.');
        return;
      }

      toast.success('Account created successfully');
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleOAuth = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: callbackUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign up with Google.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-xl border border-white/[0.08] bg-[#131211] p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#ffe633]/10 text-[#ffe633] mb-2 border border-[#ffe633]/20">
            <UserIcon size={20} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Create your Joey Workspace</h1>
          <p className="text-xs text-white/50">Start automating your social brand with autonomous AI agents</p>
        </div>

        {/* Social Auth */}
        <div className="mt-6">
          <button
            type="button"
            onClick={handleGoogleOAuth}
            disabled={loading || googleLoading}
            className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-xs font-medium text-white hover:bg-white/[0.06] hover:border-white/[0.15] transition-all disabled:opacity-50 cursor-pointer"
          >
            {googleLoading ? (
              <Loading03Icon size={14} className="animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"/>
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"/>
                <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"/>
              </svg>
            )}
            <span>Sign up with Google</span>
          </button>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/[0.08]" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
            <span className="bg-[#131211] px-2 text-white/40">or create with email</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertCircleIcon size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-white/70">
              Full Name
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 pl-9 text-xs text-white placeholder-white/20 outline-none focus:border-[#ffe633]/60 focus:ring-1 focus:ring-[#ffe633]/60 transition-all"
              />
              <UserIcon size={14} className="absolute left-3 top-3 text-white/30" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-white/70">
              Work Email
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@acme.co"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 pl-9 text-xs text-white placeholder-white/20 outline-none focus:border-[#ffe633]/60 focus:ring-1 focus:ring-[#ffe633]/60 transition-all"
              />
              <Mail01Icon size={14} className="absolute left-3 top-3 text-white/30" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-white/70">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
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
            disabled={loading || googleLoading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#ffe633] px-4 py-2.5 text-xs font-semibold text-[#0a0908] hover:bg-[#f5dc2e] transition-all shadow-[0_0_20px_0_rgba(255,230,51,0.2)] disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loading03Icon size={14} className="animate-spin" />
                <span>Creating workspace...</span>
              </>
            ) : (
              <>
                <span>Create Workspace</span>
                <ArrowRight01Icon size={14} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-white/40">
          Already have an account?{' '}
          <Link href="/login" className="text-[#ffe633] font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
