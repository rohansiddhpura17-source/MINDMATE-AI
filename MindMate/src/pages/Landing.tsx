import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain,
  Sparkles,
  BarChart2,
  BookOpen,
  Target,
  Zap,
  Shield,
  ChevronRight,
  Star,
  Check,
  ArrowRight,
  Users,
  TrendingUp,
  Clock,
  Play,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────── helpers ── */
const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(' ');

/* ─────────────────────────────────────────────────────── data ───── */
const features = [
  {
    icon: Brain,
    title: 'Learning Twin',
    description:
      'MindMate builds a living model of how you learn — your pace, style, strengths, and gaps — and adapts everything to you.',
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: Zap,
    title: 'Adaptive AI Tutor',
    description:
      'Ask anything. MindMate explains concepts in the way that works best for you, not a generic textbook answer.',
    color: 'bg-violet-50 text-violet-600',
  },
  {
    icon: Target,
    title: 'Next Best Action',
    description:
      'Every session starts with clarity. MindMate tells you exactly what to practice next and why it matters.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: BarChart2,
    title: 'Mastery Tracking',
    description:
      'Track real understanding, not just completion. See topic-by-topic mastery and close gaps before your exam.',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: BookOpen,
    title: 'Smart Materials',
    description:
      'Upload your notes and PDFs. MindMate turns them into summaries, flashcards, quizzes, and visual explanations.',
    color: 'bg-amber-50 text-amber-600',
  },
  {
    icon: Shield,
    title: 'On-Device Privacy',
    description:
      'Your learning data stays yours. MindMate processes information locally where possible, never selling your data.',
    color: 'bg-rose-50 text-rose-600',
  },
];

const steps = [
  {
    number: '01',
    title: 'Tell MindMate your goal',
    description: 'Set your subject, exam, or skill. MindMate starts building your Learning Twin immediately.',
  },
  {
    number: '02',
    title: 'Learn, practice, and get assessed',
    description: 'Use the AI tutor, take quizzes, and work through practice sessions tailored to your level.',
  },
  {
    number: '03',
    title: 'MindMate adapts to you',
    description: 'After every session, your Learning Twin evolves. Explanations, difficulty, and plans all update automatically.',
  },
  {
    number: '04',
    title: 'Master your subject',
    description: 'Reach high mastery across all topics, guided by AI that knows exactly where to focus your energy.',
  },
];

const testimonials = [
  {
    name: 'Priya Sharma',
    role: 'Computer Science Student',
    avatar: 'PS',
    quote:
      'MindMate noticed I kept making the same OOP mistake before I even realised it. The personalized review session fixed it in one sitting.',
    rating: 5,
  },
  {
    name: 'James O.',
    role: 'Engineering Graduate',
    avatar: 'JO',
    quote:
      "The Learning Twin feature is incredible. It genuinely feels like MindMate knows how I think. My exam scores went up 24% in 6 weeks.",
    rating: 5,
  },
  {
    name: 'Aisha K.',
    role: 'Data Science Bootcamp',
    avatar: 'AK',
    quote:
      'I uploaded my lecture notes and got a full flashcard set and quiz in seconds. The offline mode means I can study anywhere.',
    rating: 5,
  },
];

const stats = [
  { value: '94%', label: 'of learners improve faster' },
  { value: '3.2×', label: 'average retention increase' },
  { value: '12 min', label: 'average daily session' },
  { value: '50k+', label: 'active learners' },
];

const plans = [
  {
    name: 'Free',
    price: '\$0',
    period: 'forever',
    description: 'Start your personalized learning journey.',
    features: [
      'Learning Twin (basic)',
      'AI Tutor — 20 questions/day',
      'Adaptive Quiz',
      'Progress tracking',
      'Offline mode',
    ],
    cta: 'Get started free',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '\$9',
    period: 'per month',
    description: 'Unlock the full power of your Learning Twin.',
    features: [
      'Everything in Free',
      'Full Learning Twin',
      'Unlimited AI Tutor',
      'Smart Materials upload',
      'Adaptive Study Planner',
      'Proactive AI Insights',
      'Friends & Adaptive Battle',
    ],
    cta: 'Start free trial',
    highlighted: true,
  },
  {
    name: 'Team',
    price: '\$6',
    period: 'per seat/month',
    description: 'For study groups, bootcamps, and institutions.',
    features: [
      'Everything in Pro',
      'Shared progress dashboards',
      'Teacher/coach view',
      'Group challenges',
      'Priority support',
    ],
    cta: 'Contact us',
    highlighted: false,
  },
];

/* ─────────────────────────────────────────────────────── nav ─────── */
function LandingNav({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#e2e0f0]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-600 text-white p-1.5 rounded-xl">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <span className="font-bold text-[#0f172a] text-lg leading-none">MindMate</span>
            <p className="text-[9px] font-bold text-indigo-600 tracking-widest uppercase leading-none mt-0.5">
              Adaptive Learning Twin
            </p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <a href="#features" className="hover:text-[#0f172a] transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-[#0f172a] transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-[#0f172a] transition-colors">Pricing</a>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onLogin}
            className="hidden md:inline-flex text-sm font-medium text-slate-600 hover:text-[#0f172a] transition-colors px-3 py-2"
          >
            Log in
          </button>
          <button
            onClick={onSignup}
            className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-[10px] hover:bg-indigo-700 transition-colors"
          >
            Get started
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────────────── sections ── */

function HeroSection({ onSignup }: { onSignup: () => void }) {
  return (
    <section className="pt-32 pb-20 px-6 text-center relative overflow-hidden">
      {/* Subtle background gradient blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-b from-indigo-100/60 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-20 right-0 w-72 h-72 bg-violet-100/40 rounded-full blur-3xl" />
        <div className="absolute top-40 left-0 w-56 h-56 bg-blue-100/30 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto">
        {/* Pill badge */}
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
          <Sparkles className="h-3.5 w-3.5" />
          AI that learns how you learn
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-6xl font-extrabold text-[#0f172a] leading-[1.1] tracking-tight mb-6">
          Your personalized{' '}
          <span className="text-indigo-600">Learning Twin</span>
          <br />
          that adapts to you.
        </h1>

        {/* Subheading */}
        <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          MindMate doesn't just teach. It understands how you think, where you struggle, and
          what you need next — then adapts every explanation, quiz, and plan to fit you.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
          <button
            onClick={onSignup}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold px-8 py-3.5 rounded-[12px] hover:bg-indigo-700 transition-colors text-base shadow-lg shadow-indigo-200"
          >
            Start learning free
            <ArrowRight className="h-5 w-5" />
          </button>
          <button
            onClick={onSignup}
            className="inline-flex items-center gap-2 bg-white border border-[#e2e0f0] text-[#0f172a] font-semibold px-8 py-3.5 rounded-[12px] hover:bg-[#f8f7ff] transition-colors text-base"
          >
            <Play className="h-4 w-4 text-indigo-600 fill-indigo-600" />
            See how it works
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-extrabold text-[#0f172a]">{s.value}</div>
              <div className="text-xs text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hero mockup card */}
      <div className="relative max-w-2xl mx-auto mt-16">
        <div className="bg-white rounded-2xl border border-[#e2e0f0] shadow-xl shadow-indigo-100/30 p-6 text-left">
          <div className="flex items-start gap-4 mb-5">
            <div className="bg-indigo-600 text-white p-2 rounded-xl shrink-0">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">Next Best Action</p>
              <h3 className="text-base font-bold text-[#0f172a]">Practice Python Functions</h3>
              <p className="text-sm text-slate-500 mt-0.5">Your accuracy dropped to 48%. A focused 15-min session can close this gap.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Streak', value: '12 days', color: 'text-amber-600 bg-amber-50' },
              { label: 'Mastery', value: '72%', color: 'text-indigo-600 bg-indigo-50' },
              { label: 'Efficiency', value: '84/100', color: 'text-emerald-600 bg-emerald-50' },
            ].map((m) => (
              <div key={m.label} className={cn('rounded-xl p-3 text-center', m.color.split(' ')[1])}>
                <div className={cn('text-lg font-extrabold', m.color.split(' ')[0])}>{m.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: '72%' }} />
            </div>
            <span className="text-xs font-semibold text-slate-600">72% overall mastery</span>
          </div>
        </div>
        {/* Floating twin chip */}
        <div className="absolute -top-4 -right-4 bg-white border border-[#e2e0f0] shadow-lg rounded-xl px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-[#0f172a]">Learning Twin active</span>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold px-4 py-1.5 rounded-full mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            Built around you
          </div>
          <h2 className="text-4xl font-extrabold text-[#0f172a] tracking-tight mb-4">
            Everything adapts to how you learn
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Six core systems work together to give you a learning experience that's uniquely yours.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-[#f8f7ff] rounded-2xl p-6 border border-[#e2e0f0] hover:border-indigo-200 hover:shadow-md transition-all duration-200"
            >
              <div className={cn('inline-flex p-2.5 rounded-xl mb-4', f.color)}>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-[#0f172a] text-base mb-2">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 px-6 bg-[#f8f7ff]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold text-[#0f172a] tracking-tight mb-4">
            How MindMate works
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            The learning loop: Learn → Measure → Understand → Adapt → Improve.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className="bg-white rounded-2xl p-6 border border-[#e2e0f0] flex gap-5"
            >
              <div className="shrink-0 w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
                <span className="text-sm font-extrabold text-indigo-600">{step.number}</span>
              </div>
              <div>
                <h3 className="font-bold text-[#0f172a] mb-1.5">{step.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Learning loop visual */}
        <div className="mt-12 bg-white rounded-2xl border border-[#e2e0f0] p-8">
          <p className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
            The MindMate Learning Loop
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {['LEARN', 'MEASURE', 'UNDERSTAND', 'ADAPT', 'IMPROVE'].map((step, i, arr) => (
              <React.Fragment key={step}>
                <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold px-4 py-2 rounded-full">
                  {step}
                </div>
                {i < arr.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold text-[#0f172a] tracking-tight mb-4">
            Learners love MindMate
          </h2>
          <div className="flex items-center justify-center gap-1 mb-2">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <p className="text-slate-500 text-sm">4.9 / 5 from 2,400+ reviews</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-[#f8f7ff] rounded-2xl p-6 border border-[#e2e0f0]">
              <div className="flex gap-1 mb-4">
                {[...Array(t.rating)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-[#0f172a] text-sm leading-relaxed mb-5">"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0f172a]">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection({ onSignup }: { onSignup: () => void }) {
  return (
    <section id="pricing" className="py-24 px-6 bg-[#f8f7ff]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-extrabold text-[#0f172a] tracking-tight mb-4">
            Simple, honest pricing
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Start free. Upgrade when you're ready. No surprises.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'rounded-2xl p-6 border',
                plan.highlighted
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-200'
                  : 'bg-white border-[#e2e0f0]'
              )}
            >
              {plan.highlighted && (
                <div className="inline-flex items-center gap-1.5 bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
                  <Sparkles className="h-3 w-3" />
                  Most popular
                </div>
              )}
              <h3 className={cn('font-bold text-lg mb-1', plan.highlighted ? 'text-white' : 'text-[#0f172a]')}>
                {plan.name}
              </h3>
              <p className={cn('text-sm mb-4', plan.highlighted ? 'text-indigo-200' : 'text-slate-500')}>
                {plan.description}
              </p>
              <div className="mb-6">
                <span className={cn('text-4xl font-extrabold', plan.highlighted ? 'text-white' : 'text-[#0f172a]')}>
                  {plan.price}
                </span>
                <span className={cn('text-sm ml-1', plan.highlighted ? 'text-indigo-200' : 'text-slate-500')}>
                  /{plan.period}
                </span>
              </div>
              <ul className="space-y-3 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0 mt-0.5',
                        plan.highlighted ? 'text-indigo-200' : 'text-indigo-600'
                      )}
                    />
                    <span className={plan.highlighted ? 'text-indigo-100' : 'text-slate-600'}>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={onSignup}
                className={cn(
                  'w-full py-2.5 rounded-[10px] font-semibold text-sm transition-colors',
                  plan.highlighted
                    ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                )}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection({ onSignup }: { onSignup: () => void }) {
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-3xl mx-auto text-center">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-3xl p-12 text-white">
          <div className="inline-flex items-center gap-2 bg-white/15 text-white text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            <Users className="h-3.5 w-3.5" />
            Join 50,000+ learners
          </div>
          <h2 className="text-3xl font-extrabold mb-4 leading-tight">
            Ready to meet your Learning Twin?
          </h2>
          <p className="text-indigo-200 text-base mb-8 max-w-xl mx-auto">
            Start free today. MindMate adapts from your very first session — no setup required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onSignup}
              className="inline-flex items-center gap-2 bg-white text-indigo-600 font-bold px-8 py-3.5 rounded-[12px] hover:bg-indigo-50 transition-colors text-base"
            >
              Get started free
              <ArrowRight className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-indigo-200 text-sm">
              <Check className="h-4 w-4" />
              No credit card required
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#f8f7ff] border-t border-[#e2e0f0] py-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-600 text-white p-1.5 rounded-xl">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-[#0f172a] text-base">MindMate</span>
              <p className="text-[9px] font-bold text-indigo-600 tracking-widest uppercase leading-none mt-0.5">
                Adaptive Learning Twin
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-slate-500">
            <a href="#features" className="hover:text-[#0f172a] transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-[#0f172a] transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-[#0f172a] transition-colors">Pricing</a>
            <a href="#" className="hover:text-[#0f172a] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[#0f172a] transition-colors">Terms</a>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-[#e2e0f0] text-center text-xs text-slate-400">
          © 2026 MindMate. An AI that learns how you learn.
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────── page ────── */
export default function Landing() {
  const navigate = useNavigate();

  const goLogin = () => navigate('/login');
  const goSignup = () => navigate('/register');

  return (
    <div className="min-h-screen bg-white font-['Inter',sans-serif] overflow-x-hidden">
      <LandingNav onLogin={goLogin} onSignup={goSignup} />

      <main>
        <HeroSection onSignup={goSignup} />
        <FeaturesSection />
        <HowItWorksSection />
        <TestimonialsSection />
        <PricingSection onSignup={goSignup} />
        <CtaSection onSignup={goSignup} />
      </main>

      <Footer />
    </div>
  );
}
