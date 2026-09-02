'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { 
  SecurityLockIcon, 
  ViewIcon, 
  ViewOffIcon, 
  Loading03Icon, 
  CheckmarkCircle02Icon, 
  AlertCircleIcon,
  ArrowRight01Icon
} from 'hugeicons-react';
import { toast } from 'sonner';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setError('Please fill out all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!token) {
      setError('Missing or invalid reset token. Please request a new link.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (resetError) {
        setError(resetError.message || 'Failed to reset password. The link may have expired.');
        return;
      }

      setSuccess(true);
      toast.success('Password reset successfully');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-xl border border-white/[0.08] bg-[#131211] p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#ffe633]/10 text-[#ffe633] mb-2 border border-[#ffe633]/20">
            <SecurityLockIcon size={20} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Create New Password</h1>
          <p className="text-xs text-white/50">Enter a new secure password for your Joey account</p>
        </div>

        {error && (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertCircleIcon size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="mt-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#ffe633]/10 text-[#ffe633]">
              <CheckmarkCircle02Icon size={24} />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-white">Password updated</h2>
              <p className="text-xs text-white/50">Your password has been changed. Redirecting to login...</p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-xs font-medium text-[#ffe633] hover:underline"
            >
              <span>Click here to sign in now</span>
              <ArrowRight01Icon size={14} />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/70">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-[#ffe633]/50 focus:outline-none focus:ring-1 focus:ring-[#ffe633]/50 transition-all pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                >
                  {showPassword ? <ViewOffIcon size={14} /> : <ViewIcon size={14} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/70">Confirm New Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-[#ffe633]/50 focus:outline-none focus:ring-1 focus:ring-[#ffe633]/50 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#ffe633] px-4 py-2.5 text-xs font-semibold text-black hover:bg-[#ffe633]/90 transition-all disabled:opacity-50 mt-2 cursor-pointer shadow-lg shadow-[#ffe633]/10"
            >
              {loading ? (
                <>
                  <Loading03Icon size={14} className="animate-spin" />
                  <span>Updating password...</span>
                </>
              ) : (
                <>
                  <span>Reset password</span>
                  <ArrowRight01Icon size={14} />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#0a0908] p-4 relative overflow-hidden">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-[#ffe633]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10 w-full max-w-md mx-auto">
        <React.Suspense fallback={<div className="text-center text-xs text-white/50">Loading reset form...</div>}>
          <ResetPasswordForm />
        </React.Suspense>
      </div>
    </div>
  );
}
