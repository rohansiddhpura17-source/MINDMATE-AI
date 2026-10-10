import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, Eye, EyeOff, ArrowRight, Check } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const perks = [
  'Personal Learning Twin from session 1',
  'AI tutor that adapts to your style',
  'Smart study planner & mastery tracking',
  'Works offline — learn anywhere',
];

export default function Register() {
  const navigate = useNavigate();
  const { registerWithCredentials } = useAppContext();

  const [form, setForm] = useState({ name: '', email: '', password: '', goal: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Please enter your name.';
    if (!form.email.trim()) e.email = 'Please enter your email.';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Please enter a valid email.';
    if (!form.password.trim()) e.password = 'Please create a password.';
    else if (form.password.length < 6) e.password = 'Password must be at least 6 characters.';
    if (!agreed) e.agreed = 'Please accept the terms to continue.';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      await registerWithCredentials({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        goal: form.goal || undefined,
      });
      navigate('/home');
    } catch (err: any) {
      setErrors({ general: err?.message || 'Registration failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f7ff] font-['Inter',sans-serif] flex">
      {/* ── Left panel ─────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] shrink-0 bg-indigo-600 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-violet-500/30 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-0 w-72 h-72 bg-indigo-800/40 rounded-full blur-3xl" />
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

        {/* Headline */}
        <div className="relative">
          <h2 className="text-3xl font-extrabold text-white leading-snug mb-4">
            Start learning smarter,{' '}
            <span className="text-indigo-200">not harder.</span>
          </h2>
          <p className="text-indigo-200 text-base leading-relaxed mb-8">
            MindMate builds your personal Learning Twin from your very first session and
            adapts everything to how you learn.
          </p>
          <ul className="space-y-3">
            {perks.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm text-indigo-100">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <Check className="h-3 w-3 text-white" />
                </div>
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom note */}
        <div className="relative text-indigo-200 text-xs leading-relaxed">
          <span className="font-semibold text-white">Free to get started.</span> No credit card required.
          Upgrade to Pro anytime.
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="bg-indigo-600 text-white p-1.5 rounded-xl">
            <Brain className="h-5 w-5" />
          </div>
          <span className="font-bold text-[#0f172a] text-lg">MindMate</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-[#0f172a] mb-1.5">Create your account</h1>
            <p className="text-slate-500 text-sm">Your Learning Twin starts building from day one.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {errors.general && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-[10px] px-3.5 py-2.5">
                {errors.general}
              </div>
            )}
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5" htmlFor="reg-name">
                Full name
              </label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={set('name')}
                placeholder="Alex Johnson"
                className={`w-full h-10 px-3.5 rounded-[10px] border bg-white text-[#0f172a] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${errors.name ? 'border-red-400' : 'border-[#e2e0f0]'}`}
              />
              {errors.name && <p className="mt-1.5 text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5" htmlFor="reg-email">
                Email address
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
                placeholder="alex@example.com"
                className={`w-full h-10 px-3.5 rounded-[10px] border bg-white text-[#0f172a] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${errors.email ? 'border-red-400' : 'border-[#e2e0f0]'}`}
              />
              {errors.email && <p className="mt-1.5 text-xs text-red-500">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5" htmlFor="reg-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set('password')}
                  placeholder="Min. 6 characters"
                  className={`w-full h-10 px-3.5 pr-10 rounded-[10px] border bg-white text-[#0f172a] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${errors.password ? 'border-red-400' : 'border-[#e2e0f0]'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-500">{errors.password}</p>}
            </div>

            {/* Learning goal */}
            <div>
              <label className="block text-sm font-medium text-[#0f172a] mb-1.5" htmlFor="reg-goal">
                What are you studying? <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <select
                id="reg-goal"
                value={form.goal}
                onChange={set('goal')}
                className="w-full h-10 px-3.5 rounded-[10px] border border-[#e2e0f0] bg-white text-[#0f172a] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition appearance-none"
              >
                <option value="">Select a goal…</option>
                <option value="cs-exam">Computer Science Exam</option>
                <option value="programming">Learn Programming</option>
                <option value="data-science">Data Science</option>
                <option value="web-dev">Web Development</option>
                <option value="algorithms">Algorithms & DSA</option>
                <option value="other">Something else</option>
              </select>
            </div>

            {/* Terms */}
            <div className="pt-1">
              <label className="flex items-start gap-3 cursor-pointer">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    onClick={() => setAgreed(!agreed)}
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${agreed ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}
                  >
                    {agreed && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                </div>
                <span className="text-xs text-slate-500 leading-relaxed">
                  I agree to MindMate's{' '}
                  <span className="text-indigo-600 font-medium cursor-pointer hover:underline">Terms of Service</span>
                  {' '}and{' '}
                  <span className="text-indigo-600 font-medium cursor-pointer hover:underline">Privacy Policy</span>.
                  MindMate processes learning data locally where possible.
                </span>
              </label>
              {errors.agreed && <p className="mt-1.5 text-xs text-red-500 pl-7">{errors.agreed}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold text-sm py-2.5 rounded-[10px] hover:bg-indigo-700 transition-colors disabled:opacity-60 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating your account…
                </span>
              ) : (
                <>
                  Create free account
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-600 font-semibold hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
