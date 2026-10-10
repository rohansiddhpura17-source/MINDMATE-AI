import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, Eye, EyeOff, ArrowRight, Sparkles } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export default function Login() {
  const navigate = useNavigate();
  const { loginWithCredentials, registerWithCredentials } = useAppContext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      await loginWithCredentials({ email: email.trim(), password });
      navigate('/home');
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setLoading(true);
    setError('');
    const demoEmail = 'alex@mindmate.app';
    const demoPassword = 'DemoPassword123!';
    try {
      // Attempt login first
      await loginWithCredentials({ email: demoEmail, password: demoPassword });
      navigate('/home');
    } catch (err) {
      // If demo user does not exist yet in DB, create it
      try {
        await registerWithCredentials({
          name: 'Alex Johnson',
          email: demoEmail,
          password: demoPassword,
          goal: 'cs-exam',
        });
        navigate('/home');
      } catch (regErr: any) {
        setError(regErr?.message || 'Unable to start demo session.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f7ff] font-['Inter',sans-serif] flex">
      {/* ── Left panel ─────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] shrink-0 bg-indigo-600 flex-col justify-between p-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-violet-500/30 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-72 h-72 bg-indigo-800/40 rounded-full blur-3xl" />
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

        {/* Quote card */}
        <div className="relative bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <Sparkles className="h-5 w-5 text-indigo-200 mb-4" />
          <p className="text-white text-base leading-relaxed font-medium mb-4">
            "MindMate noticed I kept making the same OOP mistake before I even realised it.
            The personalized review session fixed it in one sitting."
          </p>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 text-white text-xs font-bold flex items-center justify-center">
              PS
            </div>
            <div>
              <p className="text-white text-sm font-semibold">Priya Sharma</p>
              <p className="text-indigo-200 text-xs">Computer Science Student</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="relative grid grid-cols-3 gap-4">
          {[
            { value: '94%', label: 'improve faster' },
            { value: '3.2×', label: 'retention' },
            { value: '50k+', label: 'learners' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-extrabold text-white">{s.value}</div>
              <div className="text-xs text-indigo-200 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel (form) ──────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="bg-indigo-600 text-white p-1.5 rounded-xl">
            <Brain className="h-5 w-5" />
          </div>
          <span className="font-bold text-[#0f172a] text-lg">MindMate</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-[#0f172a] mb-1.5">Welcome back</h1>
            <p className="text-slate-500 text-sm">Log in to continue with your Learning Twin.</p>
          </div>

          {/* Demo shortcut */}
          <button
            onClick={handleDemo}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold text-sm py-2.5 rounded-[10px] hover:bg-indigo-100 transition-colors mb-6 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            Continue as Demo User (Alex)
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-[#e2e0f0]" />
            <span className="text-xs text-slate-400 font-medium">or log in with email</span>
            <div className="flex-1 h-px bg-[#e2e0f0]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@example.com"
                className="w-full h-10 px-3.5 rounded-[10px] border border-[#e2e0f0] bg-white text-[#0f172a] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-[#0f172a]" htmlFor="password">
                  Password
                </label>
                <button type="button" className="text-xs text-indigo-600 hover:underline font-medium">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 px-3.5 pr-10 rounded-[10px] border border-[#e2e0f0] bg-white text-[#0f172a] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-[10px] px-3.5 py-2.5">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold text-sm py-2.5 rounded-[10px] hover:bg-indigo-700 transition-colors disabled:opacity-60 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Logging in…
                </span>
              ) : (
                <>
                  Log in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-indigo-600 font-semibold hover:underline">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
