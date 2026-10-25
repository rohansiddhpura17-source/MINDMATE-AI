import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, ArrowLeft, Mail, CheckCircle2, Sparkles, Send } from 'lucide-react';
import { supabase, isSupabaseConfigured, SUPABASE_NOT_CONFIGURED_MESSAGE } from '../lib/supabase';
import SupabaseSetupNotice from '../components/ui/SupabaseSetupNotice';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!isSupabaseConfigured) {
      setError(SUPABASE_NOT_CONFIGURED_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });

      if (resetError) {
        // Do not leak system information, show generic guidance if rate limited
        if (resetError.message.toLowerCase().includes('rate')) {
          setError('Too many requests. Please wait a few minutes before trying again.');
          return;
        }
      }

      setSent(true);
    } catch {
      // Security best practice: confirm submission without leaking email existence
      setSent(true);
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

        {/* Security quote */}
        <div className="relative bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <Sparkles className="h-5 w-5 text-indigo-200 mb-3" />
          <h3 className="font-bold text-white text-base mb-2">Secure Account Recovery</h3>
          <p className="text-indigo-100 text-sm leading-relaxed">
            Your learning progress, flashcard reviews, and AI Twin personalization are securely protected. We'll send you an encrypted single-use link to restore access.
          </p>
        </div>

        {/* Footer info */}
        <div className="relative text-xs text-indigo-200">
          MindMate AI Learning Platform · Encrypted Auth
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
          {!sent ? (
            <>
              <div className="mb-6">
                <Link
                  to="/login"
                  className="inline-flex items-center text-xs font-semibold text-muted hover:text-primary transition-colors mb-4"
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Log in
                </Link>
                <h1 className="text-2xl font-extrabold text-dark mb-1.5">Forgot Password?</h1>
                <p className="text-muted text-sm">
                  Enter your registered email address to receive password reset instructions.
                </p>
              </div>

              <SupabaseSetupNotice />

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark mb-1.5" htmlFor="email">
                    Email address
                  </label>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@example.com"
                      className="w-full h-11 px-3.5 pl-10 rounded-xl border border-border bg-surface text-dark text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    />
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
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
                      Sending reset link…
                    </span>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Reset Link
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
              <h2 className="text-2xl font-bold text-dark mb-2">Check your email</h2>
              <p className="text-sm text-muted mb-6">
                If an account exists for <strong className="text-dark">{email}</strong>, we've sent password reset instructions. Please check your inbox and click the link to reset your password.
              </p>
              <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-muted mb-6 text-left space-y-1.5">
                <p>• Check your spam or promotions folder if you don't see it.</p>
                <p>• The reset link expires in 1 hour for your security.</p>
              </div>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => { setSent(false); setEmail(''); }}
                  className="w-full text-xs font-semibold text-primary hover:underline"
                >
                  Try another email address
                </button>
                <Link
                  to="/login"
                  className="block w-full py-2.5 rounded-xl border border-border bg-surface text-dark font-medium text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                >
                  Back to Log in
                </Link>
              </div>
            </div>
          )}

          <p className="mt-8 text-center text-xs text-muted">
            Remembered your password?{' '}
            <Link to="/login" className="text-primary font-semibold hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
