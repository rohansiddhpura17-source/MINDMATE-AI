import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAppContext } from '../context/AppContext';
import { TOPICS, resolveTopicMetadata } from '../data/learningContent';
import {
  Video,
  Calendar,
  Clock,
  User,
  ExternalLink,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  Cloud,
  HardDrive,
  Sparkles,
  BookOpen,
  Info,
} from 'lucide-react';
import {
  ZoomClassItem,
  ZoomClassInput,
  ZoomClassStatus,
  listZoomClasses,
  createZoomClass,
  updateZoomClass,
  deleteZoomClass,
  validateZoomClassInput,
  validateZoomMeetingUrl,
  getPlannerWeekdayLabel,
} from '../services/zoom/zoomClassesService';

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatLocalSchedule(scheduledDate: string, startTime: string): string {
  const [y, m, d] = scheduledDate.split('-').map(Number);
  const [hh, mm] = startTime.split(':').map(Number);
  if (!y || !m || !d) return `${scheduledDate} ${startTime}`;
  const dt = new Date(y, m - 1, d, hh || 0, mm || 0);
  if (Number.isNaN(dt.getTime())) return `${scheduledDate} ${startTime}`;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(dt);
}

const INITIAL_FORM: ZoomClassInput = {
  title: '',
  description: '',
  instructor_name: '',
  scheduled_date: getTodayDateString(),
  start_time: '16:00',
  duration_minutes: 60,
  meeting_url: '',
  topic_id: 'python-functions',
  status: 'upcoming',
};

export default function ZoomClasses() {
  const { user, showToast } = useAppContext();
  const navigate = useNavigate();

  const [classes, setClasses] = useState<ZoomClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [persistenceSource, setPersistenceSource] = useState<'cloud' | 'local'>('local');
  const [activeTab, setActiveTab] = useState<'upcoming' | 'completed' | 'cancelled' | 'all'>('upcoming');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ZoomClassInput>(INITIAL_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof ZoomClassInput, boolean>>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ZoomClassInput, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadClasses = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await listZoomClasses(user.id);
      setClasses(res.data);
      setPersistenceSource(res.persistenceSource);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadClasses();
  }, [user?.id]);

  const handleFieldChange = <K extends keyof ZoomClassInput>(
    key: K,
    value: ZoomClassInput[K]
  ) => {
    const nextForm = { ...form, [key]: value };
    setForm(nextForm);

    if (touched[key]) {
      const validation = validateZoomClassInput(nextForm);
      setFieldErrors((prev) => ({
        ...prev,
        [key]: validation.errors[key],
      }));
    }
  };

  const handleFieldBlur = (key: keyof ZoomClassInput) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
    const validation = validateZoomClassInput(form);
    setFieldErrors((prev) => ({
      ...prev,
      [key]: validation.errors[key],
    }));
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm({
      ...INITIAL_FORM,
      scheduled_date: getTodayDateString(),
    });
    setTouched({});
    setFieldErrors({});
    setShowForm(true);
  };

  const handleOpenEdit = (cls: ZoomClassItem) => {
    setEditingId(cls.id);
    setForm({
      title: cls.title,
      description: cls.description,
      instructor_name: cls.instructor_name,
      scheduled_date: cls.scheduled_date,
      start_time: cls.start_time,
      duration_minutes: cls.duration_minutes,
      meeting_url: cls.meeting_url,
      topic_id: cls.topic_id,
      status: cls.status,
    });
    setTouched({});
    setFieldErrors({});
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTouched({});
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    const allTouched: Partial<Record<keyof ZoomClassInput, boolean>> = {
      title: true,
      scheduled_date: true,
      start_time: true,
      duration_minutes: true,
      meeting_url: true,
    };
    setTouched(allTouched);

    const validation = validateZoomClassInput(form);
    setFieldErrors(validation.errors);
    if (!validation.valid) {
      showToast('Please fix the highlighted fields before saving.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        const res = await updateZoomClass(user.id, editingId, form);
        if (res.error || !res.data) {
          if (res.validationErrors) setFieldErrors(res.validationErrors);
          showToast(res.error || 'Failed to update Zoom class.', 'error');
          return;
        }
        setClasses((prev) =>
          prev
            .map((c) => (c.id === editingId ? res.data! : c))
            .sort((a, b) =>
              `${a.scheduled_date}T${a.start_time}`.localeCompare(
                `${b.scheduled_date}T${b.start_time}`
              )
            )
        );
        setPersistenceSource(res.data.persistence_source);
        showToast(
          `Updated "${res.data.title}" and synced with your Weekly Planner (${getPlannerWeekdayLabel(
            res.data.scheduled_date
          )}).`,
          'success'
        );
      } else {
        const res = await createZoomClass(user.id, form);
        if (res.error || !res.data) {
          if (res.validationErrors) setFieldErrors(res.validationErrors);
          showToast(res.error || 'Failed to schedule Zoom class.', 'error');
          return;
        }
        setClasses((prev) =>
          [...prev, res.data!].sort((a, b) =>
            `${a.scheduled_date}T${a.start_time}`.localeCompare(
              `${b.scheduled_date}T${b.start_time}`
            )
          )
        );
        setPersistenceSource(res.data.persistence_source);
        showToast(
          `Scheduled "${res.data.title}" and added to Weekly Planner (${getPlannerWeekdayLabel(
            res.data.scheduled_date
          )}).`,
          'success'
        );
      }
      setShowForm(false);
      setEditingId(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (cls: ZoomClassItem, nextStatus: ZoomClassStatus) => {
    if (!user?.id) return;
    const res = await updateZoomClass(user.id, cls.id, { status: nextStatus });
    if (res.error || !res.data) {
      showToast(res.error || 'Could not update status.', 'error');
      return;
    }
    setClasses((prev) => prev.map((c) => (c.id === cls.id ? res.data! : c)));
    showToast(`Marked "${cls.title}" as ${nextStatus}.`, 'success');
  };

  const handleDelete = async (cls: ZoomClassItem) => {
    if (!user?.id) return;
    const res = await deleteZoomClass(user.id, cls.id);
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    setClasses((prev) => prev.filter((c) => c.id !== cls.id));
    showToast(`Removed "${cls.title}" from Zoom Classes and Weekly Planner.`, 'info');
  };

  const handleCopyLink = async (cls: ZoomClassItem) => {
    try {
      await navigator.clipboard.writeText(cls.meeting_url);
      setCopiedId(cls.id);
      showToast('Zoom meeting link copied to clipboard.', 'success');
      setTimeout(() => setCopiedId((prev) => (prev === cls.id ? null : prev)), 2000);
    } catch {
      showToast('Could not copy link automatically.', 'info');
    }
  };

  const upcomingCount = classes.filter((c) => c.status === 'upcoming').length;
  const completedCount = classes.filter((c) => c.status === 'completed').length;
  const cancelledCount = classes.filter((c) => c.status === 'cancelled').length;

  const filteredClasses = classes.filter((c) =>
    activeTab === 'all' ? true : c.status === activeTab
  );

  return (
    <AppShell
      pageTitle="Zoom Classes"
      pageSubtitle="Schedule live study sessions, join official Zoom links, and sync directly with your Weekly Planner"
    >
      <div className="max-w-6xl mx-auto space-y-6 pb-8" data-testid="zoom-classes-page">
        {/* Top Summary & Action Bar */}
        <Card className="p-6 border border-border bg-surface shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                  <Video className="h-3.5 w-3.5" />
                  Live Class Hub
                </span>

                <span
                  data-testid="zoom-persistence-badge"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    persistenceSource === 'cloud'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  {persistenceSource === 'cloud' ? (
                    <>
                      <Cloud className="h-3.5 w-3.5" />
                      Synced to Supabase Cloud
                    </>
                  ) : (
                    <>
                      <HardDrive className="h-3.5 w-3.5" />
                      Saved Locally Only
                    </>
                  )}
                </span>
              </div>

              <h2 className="text-xl font-bold text-dark">
                Manage Live Tutoring & Study Group Sessions
              </h2>
              <p className="text-sm text-muted max-w-2xl">
                Add official Zoom meeting links from your instructor or study group. Every upcoming class automatically syncs to your{' '}
                <button
                  type="button"
                  onClick={() => navigate('/planner')}
                  className="text-primary font-semibold underline underline-offset-2 hover:opacity-80"
                >
                  Weekly Planner
                </button>{' '}
                and links to your adaptive curriculum topic.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/planner')}
                className="gap-1.5 text-xs"
              >
                <Calendar className="h-4 w-4" />
                View Weekly Planner
              </Button>
              <Button
                size="sm"
                onClick={handleOpenCreate}
                data-testid="open-add-zoom-class-btn"
                className="gap-1.5 text-xs"
              >
                <Plus className="h-4 w-4" />
                Add Zoom Class
              </Button>
            </div>
          </div>

          {/* Honest Zoom Link & OAuth Notice */}
          <div className="mt-4 pt-4 border-t border-border/60 flex items-start gap-2.5 text-xs text-muted">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-dark">Official Zoom Link Management:</strong> Paste an existing Zoom join URL (<code className="font-mono text-dark">https://zoom.us/j/...</code> or <code className="font-mono text-dark">https://*.zoom.us/j/...</code>). MindMate validates the link and opens it directly in Zoom. Automatic Zoom meeting generation requires server-side Zoom Server-to-Server OAuth credentials (<code className="font-mono">ZOOM_ACCOUNT_ID</code>, <code className="font-mono">ZOOM_CLIENT_ID</code>, <code className="font-mono">ZOOM_CLIENT_SECRET</code>).
            </p>
          </div>
        </Card>

        {/* Add / Edit Zoom Class Modal / Drawer Card */}
        {showForm && (
          <Card
            className="p-6 border-2 border-primary/30 bg-surface shadow-md animate-in fade-in"
            data-testid="zoom-class-form-card"
          >
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-border">
              <div>
                <h3 className="text-lg font-bold text-dark">
                  {editingId ? 'Edit Zoom Class' : 'Schedule a New Zoom Class'}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Required fields are marked with <span className="text-red-600 font-bold">*</span>. Format instructions are shown above each field.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCancelForm}>
                Cancel
              </Button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Title */}
                <div>
                  <label htmlFor="zoom-title" className="block text-xs font-semibold text-dark uppercase tracking-wider">
                    Class Title <span aria-hidden="true" className="text-red-600">*</span>
                  </label>
                  <p id="zoom-title-hint" className="text-[11px] text-muted mt-0.5 mb-1.5">
                    3–120 characters (e.g., Python Recursion Office Hours)
                  </p>
                  <input
                    id="zoom-title"
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => handleFieldChange('title', e.target.value)}
                    onBlur={() => handleFieldBlur('title')}
                    aria-describedby="zoom-title-hint"
                    aria-invalid={Boolean(touched.title && fieldErrors.title)}
                    aria-errormessage={touched.title && fieldErrors.title ? 'zoom-title-error' : undefined}
                    placeholder="e.g., Python Functions & Recursion Live Review"
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm bg-background text-dark focus:outline-none focus:ring-2 focus:ring-primary ${
                      touched.title && fieldErrors.title ? 'border-red-500' : 'border-border'
                    }`}
                  />
                  {touched.title && fieldErrors.title && (
                    <p
                      id="zoom-title-error"
                      role="alert"
                      className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{fieldErrors.title}</span>
                    </p>
                  )}
                </div>

                {/* Topic / Subject */}
                <div>
                  <label htmlFor="zoom-topic" className="block text-xs font-semibold text-dark uppercase tracking-wider">
                    Curriculum Topic
                  </label>
                  <p id="zoom-topic-hint" className="text-[11px] text-muted mt-0.5 mb-1.5">
                    Links this class to Mate AI tutoring and follow-up quizzes
                  </p>
                  <select
                    id="zoom-topic"
                    value={form.topic_id}
                    onChange={(e) => handleFieldChange('topic_id', e.target.value)}
                    aria-describedby="zoom-topic-hint"
                    className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-background text-dark focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {TOPICS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Instructor / Host Name */}
                <div>
                  <label htmlFor="zoom-instructor" className="block text-xs font-semibold text-dark uppercase tracking-wider">
                    Instructor or Host Name
                  </label>
                  <p id="zoom-instructor-hint" className="text-[11px] text-muted mt-0.5 mb-1.5">
                    Optional — instructor, TA, or peer study host
                  </p>
                  <input
                    id="zoom-instructor"
                    type="text"
                    value={form.instructor_name}
                    onChange={(e) => handleFieldChange('instructor_name', e.target.value)}
                    aria-describedby="zoom-instructor-hint"
                    placeholder="e.g., Prof. Ananya Sharma"
                    className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-background text-dark focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Zoom Meeting URL */}
                <div>
                  <label htmlFor="zoom-url" className="block text-xs font-semibold text-dark uppercase tracking-wider">
                    Official Zoom Meeting Link <span aria-hidden="true" className="text-red-600">*</span>
                  </label>
                  <p id="zoom-url-hint" className="text-[11px] text-muted mt-0.5 mb-1.5">
                    Format: https://zoom.us/j/1234567890 or https://us06web.zoom.us/j/...
                  </p>
                  <input
                    id="zoom-url"
                    type="url"
                    required
                    value={form.meeting_url}
                    onChange={(e) => handleFieldChange('meeting_url', e.target.value)}
                    onBlur={() => handleFieldBlur('meeting_url')}
                    aria-describedby="zoom-url-hint"
                    aria-invalid={Boolean(touched.meeting_url && fieldErrors.meeting_url)}
                    aria-errormessage={touched.meeting_url && fieldErrors.meeting_url ? 'zoom-url-error' : undefined}
                    placeholder="https://zoom.us/j/9876543210"
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm bg-background text-dark font-mono focus:outline-none focus:ring-2 focus:ring-primary ${
                      touched.meeting_url && fieldErrors.meeting_url ? 'border-red-500' : 'border-border'
                    }`}
                  />
                  {touched.meeting_url && fieldErrors.meeting_url && (
                    <p
                      id="zoom-url-error"
                      role="alert"
                      className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{fieldErrors.meeting_url}</span>
                    </p>
                  )}
                </div>

                {/* Scheduled Date */}
                <div>
                  <label htmlFor="zoom-date" className="block text-xs font-semibold text-dark uppercase tracking-wider">
                    Scheduled Date <span aria-hidden="true" className="text-red-600">*</span>
                  </label>
                  <p id="zoom-date-hint" className="text-[11px] text-muted mt-0.5 mb-1.5">
                    Local date (YYYY-MM-DD) — syncs to {getPlannerWeekdayLabel(form.scheduled_date)} in Weekly Planner
                  </p>
                  <input
                    id="zoom-date"
                    type="date"
                    required
                    value={form.scheduled_date}
                    onChange={(e) => handleFieldChange('scheduled_date', e.target.value)}
                    onBlur={() => handleFieldBlur('scheduled_date')}
                    aria-describedby="zoom-date-hint"
                    aria-invalid={Boolean(touched.scheduled_date && fieldErrors.scheduled_date)}
                    aria-errormessage={
                      touched.scheduled_date && fieldErrors.scheduled_date ? 'zoom-date-error' : undefined
                    }
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm bg-background text-dark focus:outline-none focus:ring-2 focus:ring-primary ${
                      touched.scheduled_date && fieldErrors.scheduled_date ? 'border-red-500' : 'border-border'
                    }`}
                  />
                  {touched.scheduled_date && fieldErrors.scheduled_date && (
                    <p
                      id="zoom-date-error"
                      role="alert"
                      className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{fieldErrors.scheduled_date}</span>
                    </p>
                  )}
                </div>

                {/* Start Time & Duration */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="zoom-time" className="block text-xs font-semibold text-dark uppercase tracking-wider">
                      Start Time <span aria-hidden="true" className="text-red-600">*</span>
                    </label>
                    <p id="zoom-time-hint" className="text-[11px] text-muted mt-0.5 mb-1.5">
                      24h local time (HH:MM)
                    </p>
                    <input
                      id="zoom-time"
                      type="time"
                      required
                      value={form.start_time}
                      onChange={(e) => handleFieldChange('start_time', e.target.value)}
                      onBlur={() => handleFieldBlur('start_time')}
                      aria-describedby="zoom-time-hint"
                      aria-invalid={Boolean(touched.start_time && fieldErrors.start_time)}
                      aria-errormessage={
                        touched.start_time && fieldErrors.start_time ? 'zoom-time-error' : undefined
                      }
                      className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-background text-dark focus:outline-none focus:ring-2 focus:ring-primary ${
                        touched.start_time && fieldErrors.start_time ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {touched.start_time && fieldErrors.start_time && (
                      <p
                        id="zoom-time-error"
                        role="alert"
                        className="mt-1.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium"
                      >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{fieldErrors.start_time}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="zoom-duration" className="block text-xs font-semibold text-dark uppercase tracking-wider">
                      Duration (min) <span aria-hidden="true" className="text-red-600">*</span>
                    </label>
                    <p id="zoom-duration-hint" className="text-[11px] text-muted mt-0.5 mb-1.5">
                      15 to 360 minutes
                    </p>
                    <input
                      id="zoom-duration"
                      type="number"
                      min={15}
                      max={360}
                      step={5}
                      required
                      value={form.duration_minutes}
                      onChange={(e) => handleFieldChange('duration_minutes', Number(e.target.value))}
                      onBlur={() => handleFieldBlur('duration_minutes')}
                      aria-describedby="zoom-duration-hint"
                      aria-invalid={Boolean(touched.duration_minutes && fieldErrors.duration_minutes)}
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm bg-background text-dark focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label htmlFor="zoom-description" className="block text-xs font-semibold text-dark uppercase tracking-wider">
                  Session Agenda & Study Notes
                </label>
                <p id="zoom-description-hint" className="text-[11px] text-muted mt-0.5 mb-1.5">
                  Optional — key questions or problem sets to cover during the live session
                </p>
                <textarea
                  id="zoom-description"
                  rows={2}
                  value={form.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  aria-describedby="zoom-description-hint"
                  placeholder="e.g., Cover base cases, call stack trace diagrams, and practice quiz mistakes."
                  className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-background text-dark focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
                <Button type="button" variant="secondary" size="sm" onClick={handleCancelForm}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                  data-testid="save-zoom-class-btn"
                  className="gap-1.5"
                >
                  <Video className="h-4 w-4" />
                  {isSaving
                    ? 'Saving...'
                    : editingId
                      ? 'Save Changes & Sync Planner'
                      : 'Schedule Class & Sync Planner'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-border bg-surface p-1 shadow-xs" role="tablist">
            {(
              [
                { id: 'upcoming', label: 'Upcoming', count: upcomingCount },
                { id: 'completed', label: 'Completed', count: completedCount },
                { id: 'cancelled', label: 'Cancelled', count: cancelledCount },
                { id: 'all', label: 'All Classes', count: classes.length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-dark'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-100 dark:bg-slate-800 text-muted'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Classes List */}
        {loading ? (
          <Card className="p-8 text-center text-sm text-muted">
            Loading your scheduled Zoom classes...
          </Card>
        ) : filteredClasses.length === 0 ? (
          <Card className="p-10 text-center space-y-4 border border-dashed border-border bg-surface">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Video className="h-6 w-6" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-bold text-dark">
                {activeTab === 'upcoming'
                  ? 'No upcoming Zoom classes scheduled yet'
                  : `No ${activeTab === 'all' ? '' : activeTab} Zoom classes found`}
              </h3>
              <p className="text-xs text-muted leading-relaxed">
                Schedule your upcoming live lectures, office hours, or peer study sessions with an official Zoom meeting link.
              </p>
            </div>
            <div>
              <Button size="sm" onClick={handleOpenCreate} className="gap-1.5 text-xs">
                <Plus className="h-4 w-4" />
                Schedule Your First Zoom Class
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="zoom-classes-list">
            {filteredClasses.map((cls) => {
              const topicMeta = resolveTopicMetadata(cls.topic_id);
              const urlValid = validateZoomMeetingUrl(cls.meeting_url).valid;
              const weekdayLabel = getPlannerWeekdayLabel(cls.scheduled_date);

              return (
                <Card
                  key={cls.id}
                  data-testid="zoom-class-card"
                  className="p-5 border border-border bg-surface shadow-sm flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                            cls.status === 'upcoming'
                              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                              : cls.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-gray-200 text-gray-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {cls.status}
                        </span>

                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
                          <BookOpen className="h-3 w-3" />
                          {topicMeta.name}
                        </span>

                        {cls.status !== 'cancelled' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            Planner: {weekdayLabel}
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-muted font-medium">
                        {cls.persistence_source === 'cloud' ? 'Cloud Synced' : 'Local Storage'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-dark">{cls.title}</h3>
                      {cls.description && (
                        <p className="text-xs text-muted mt-1 leading-relaxed">
                          {cls.description}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs text-muted">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-dark font-medium">
                          {formatLocalSchedule(cls.scheduled_date, cls.start_time)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{cls.duration_minutes} minutes</span>
                      </div>
                      {cls.instructor_name && (
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <User className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>Host: {cls.instructor_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {urlValid && cls.status !== 'cancelled' ? (
                        <a
                          href={cls.meeting_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="join-zoom-meeting-link"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-xs hover:opacity-95 transition-opacity"
                        >
                          <Video className="h-3.5 w-3.5" />
                          Join Meeting
                          <ExternalLink className="h-3 w-3 opacity-80" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-muted text-xs font-medium">
                          {cls.status === 'cancelled' ? 'Class Cancelled' : 'Invalid Zoom URL'}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopyLink(cls)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:border-primary/40 text-xs text-muted hover:text-dark transition-colors"
                        title="Copy Zoom Link"
                      >
                        {copiedId === cls.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/learn?topic=${encodeURIComponent(topicMeta.id)}`)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:border-primary/40 text-xs text-primary font-medium transition-colors"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Prep with Mate AI
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {cls.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(cls, 'completed')}
                          title="Mark Completed"
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      {cls.status === 'upcoming' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(cls, 'cancelled')}
                          title="Cancel Class"
                          className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(cls)}
                        title="Edit Class"
                        className="p-1.5 rounded-lg text-muted hover:text-dark hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(cls)}
                        title="Delete Class"
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
