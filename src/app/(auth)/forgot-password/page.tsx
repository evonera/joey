'use client';

import * as React from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { 
  Mail01Icon, 
  ArrowLeft01Icon, 
  ArrowRight01Icon, 
  Loading03Icon, 
  CheckmarkCircle02Icon, 
  AlertCircleIcon,
  SecurityLockIcon 
} from 'hugeicons-react';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError(null);
    setLoading(true);

    try {
      const { error: resetError } = await authClient.requestPasswordReset({
        email,
        redirectTo: '/reset-password',
      });

      if (resetError) {
        setError(resetError.message || 'Failed to send password reset email.');
        return;
      }

      setSent(true);
      toast.success('Reset email sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#0a0908] p-4 relative overflow-hidden">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-[#ffe633]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="rounded-xl border border-white/[0.08] bg-[#131211] p-8 shadow-2xl backdrop-blur-xl">
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#ffe633]/10 text-[#ffe633] mb-2 border border-[#ffe633]/20">
              <SecurityLockIcon size={20} strokeWidth={1.5} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Reset Password</h1>
            <p className="text-xs text-white/50">Enter your email address to receive a secure recovery link</p>
          </div>

          {sent ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-400">
                <CheckmarkCircle02Icon size={18} className="shrink-0" />
                <div>
                  <p className="font-semibold">Recovery link sent</p>
                  <p className="text-[11px] text-emerald-400/80 mt-0.5">
                    Check your inbox for instructions to reset your password.
                  </p>
                </div>
              </div>
              <Link
                href="/login"
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-xs font-medium text-white hover:bg-white/[0.06] transition-colors"
              >
                <ArrowLeft01Icon size={14} />
                <span>Return to sign in</span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                  <AlertCircleIcon size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

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

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#ffe633] px-4 py-2.5 text-xs font-semibold text-[#0a0908] hover:bg-[#f5dc2e] transition-all shadow-[0_0_20px_0_rgba(255,230,51,0.2)] disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loading03Icon size={14} className="animate-spin" />
                    <span>Sending link...</span>
                  </>
                ) : (
                  <>
                    <span>Send Recovery Link</span>
                    <ArrowRight01Icon size={14} />
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
                >
                  <ArrowLeft01Icon size={12} />
                  <span>Back to sign in</span>
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
