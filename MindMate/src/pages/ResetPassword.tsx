import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, Eye, EyeOff, Lock, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ResetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [hasValidSession, setHasValidSession] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Check for recovery session from Supabase reset link
  useEffect(() => {
    let mounted = true;

    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || (session && session.user)) {
        setHasValidSession(true);
      }
    });

    // Also check current active session or recovery params in URL hash/search
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const isRecovery = hash.includes('type=recovery') || search.includes('type=recovery') || search.includes('code=');

      if (session?.user || isRecovery) {
        setHasValidSession(true);
      } else {
        // Give hash-parsing a brief moment to finish before declaring invalid
        setTimeout(() => {
          if (mounted && hasValidSession === null) {
            supabase.auth.getSession().then(({ data: { session: retrySession } }) => {
              if (mounted) {
                setHasValidSession(Boolean(retrySession?.user));
              }
            });
          }
        }, 800);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password.trim()) {
      setError('Please enter a new password.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password.trim(),
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Your recovery link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-['Inter',sans-serif] flex text-dark">
      {/* ── Left panel ─────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] shrink-0 bg-primary flex-col justify-between p-12 relative overflow-hidden text-white">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-violet-400/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-72 h-72 bg-indigo-900/40 rounded-full blur-3xl" />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="bg-white/20 backdrop-blur-sm p-2 rounded-xl">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <span className="font-bold text-white text-xl leading-none">MindMate</span>
            <p className="text-[10px] font-bold text-indigo-200 tracking-widest uppercase leading-none mt-0.5">
              Adaptive Learning Twin
            </p>
          </div>
        </div>

        {/* Security badge */}
        <div className="relative bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <ShieldCheck className="h-6 w-6 text-emerald-300 mb-3" />
          <h3 className="font-bold text-white text-base mb-1.5">Create a Strong Password</h3>
          <p className="text-indigo-100 text-sm leading-relaxed">
            Choose a secure password of at least 6 characters with a combination of letters and numbers to protect your learning twin.
          </p>
        </div>

        {/* Footer info */}
        <div className="relative text-xs text-indigo-200">
          MindMate AI Learning Platform · Password Security
        </div>
      </div>

      {/* ── Right panel (form) ──────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-8">
          <div className="bg-primary text-white p-1.5 rounded-xl">
            <Brain className="h-5 w-5" />
          </div>
          <span className="font-bold text-dark text-lg">MindMate</span>
        </div>

        <div className="w-full max-w-sm">
          {hasValidSession === false && !success ? (
            <div className="text-center py-4">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center mb-4">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold text-dark mb-2">Invalid or Expired Link</h2>
              <p className="text-sm text-muted mb-6">
                This password recovery link is either invalid, has expired, or was already used. Please request a new recovery link.
              </p>
              <div className="space-y-3">
                <Link
                  to="/forgot-password"
                  className="block w-full py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition shadow-sm text-center"
                >
                  Request New Reset Link
                </Link>
                <Link
                  to="/login"
                  className="block w-full py-2.5 rounded-xl border border-border bg-surface text-dark font-medium text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition text-center"
                >
                  Back to Log in
                </Link>
              </div>
            </div>
          ) : !success ? (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-extrabold text-dark mb-1.5">Set New Password</h1>
                <p className="text-muted text-sm">
                  Please choose a new, secure password for your MindMate account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New Password */}
                <div>
                  <label className="block text-sm font-medium text-dark mb-1.5" htmlFor="password">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full h-11 px-3.5 pr-10 rounded-xl border border-border bg-surface text-dark text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-dark transition-colors"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-dark mb-1.5" htmlFor="confirmPassword">
                    Confirm new password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full h-11 px-3.5 pr-10 rounded-xl border border-border bg-surface text-dark text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-dark transition-colors"
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Password strength checklist */}
                <div className="p-3 bg-gray-50/70 dark:bg-slate-900/60 rounded-xl border border-border/60 text-xs space-y-1.5">
                  <div className={`flex items-center gap-1.5 ${password.length >= 6 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    At least 6 characters
                  </div>
                  <div className={`flex items-center gap-1.5 ${password && password === confirmPassword ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    Passwords match
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl px-3.5 py-2.5">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm mt-2"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Updating password…
                    </span>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Reset Password
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-bold text-dark mb-2">Password Reset Successful!</h2>
              <p className="text-sm text-muted mb-6">
                Your password has been securely updated. You can now log into your MindMate account using your new credentials.
              </p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-primary/90 transition shadow-sm"
              >
                Go to Log in <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
