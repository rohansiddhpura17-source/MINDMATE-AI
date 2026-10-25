import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export type ZoomClassStatus = 'upcoming' | 'completed' | 'cancelled';

export interface ZoomClassItem {
  id: string;
  user_id: string;
  title: string;
  description: string;
  instructor_name: string;
  scheduled_date: string; // YYYY-MM-DD
  start_time: string;     // HH:mm (24h)
  duration_minutes: number;
  meeting_url: string;
  topic_id: string;
  status: ZoomClassStatus;
  planner_task_id: string;
  persistence_source: 'cloud' | 'local';
  created_at: string;
  updated_at: string;
}

export interface ZoomClassInput {
  title: string;
  description?: string;
  instructor_name?: string;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  meeting_url: string;
  topic_id?: string;
  status?: ZoomClassStatus;
}

export interface ZoomValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof ZoomClassInput, string>>;
}

const ZOOM_STORAGE_PREFIX = 'mindmate_zoom_classes_';
const PLANNER_STORAGE_PREFIX = 'mindmate_planner_tasks_';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canSyncUserToSupabase(userId: string): boolean {
  return Boolean(isSupabaseConfigured && userId && UUID_REGEX.test(userId));
}

function getZoomStorageKey(userId: string): string {
  return `${ZOOM_STORAGE_PREFIX}${userId}`;
}

function getPlannerStorageKey(userId: string): string {
  return `${PLANNER_STORAGE_PREFIX}${userId}`;
}

export function getDeterministicPlannerTaskId(classId: string): string {
  return `zoom-class-${classId}`;
}

/**
 * Validates that a URL is an official HTTPS Zoom meeting or webinar join URL.
 * Supports:
 * - https://zoom.us/j/1234567890
 * - https://us02web.zoom.us/j/1234567890?pwd=...
 * - https://*.zoom.us/j/..., /w/..., /s/..., /my/...
 * - https://zoom.com/j/...
 */
export function validateZoomMeetingUrl(rawUrl: string): {
  valid: boolean;
  normalizedUrl: string;
  error?: string;
} {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Enter a Zoom meeting link (e.g., https://zoom.us/j/1234567890).',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalizedUrl: trimmed,
      error: 'Enter a valid URL starting with https:// (e.g., https://zoom.us/j/1234567890).',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalizedUrl: trimmed,
      error: 'Zoom meeting links must use HTTPS (https://zoom.us/j/...).',
    };
  }

  const host = parsed.hostname.toLowerCase();
  const isZoomHost =
    host === 'zoom.us' ||
    host.endsWith('.zoom.us') ||
    host === 'zoom.com' ||
    host.endsWith('.zoom.com');

  if (!isZoomHost) {
    return {
      valid: false,
      normalizedUrl: trimmed,
      error: 'Link must be an official Zoom domain (zoom.us or *.zoom.us).',
    };
  }

  const path = parsed.pathname;
  const isValidZoomPath =
    /^\/(j|s|w|wc\/join)\/[0-9A-Za-z._-]+/.test(path) ||
    /^\/my\/[0-9A-Za-z._-]+/.test(path);

  if (!isValidZoomPath) {
    return {
      valid: false,
      normalizedUrl: trimmed,
      error:
        'Zoom link must include a meeting path such as /j/<meeting-id>, /w/<webinar-id>, or /my/<personal-link>.',
    };
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
  };
}

/**
 * Validates all fields of a ZoomClassInput before creation or update.
 */
export function validateZoomClassInput(input: ZoomClassInput): ZoomValidationResult {
  const errors: Partial<Record<keyof ZoomClassInput, string>> = {};

  const title = (input.title || '').trim();
  if (!title) {
    errors.title = 'Enter a class title (e.g., Python Recursion Live Workshop).';
  } else if (title.length < 3) {
    errors.title = 'Class title must be at least 3 characters.';
  } else if (title.length > 120) {
    errors.title = 'Class title cannot exceed 120 characters.';
  }

  const dateStr = (input.scheduled_date || '').trim();
  if (!dateStr) {
    errors.scheduled_date = 'Select a scheduled date (YYYY-MM-DD).';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    errors.scheduled_date = 'Date must follow YYYY-MM-DD format.';
  } else {
    const [y, m, d] = dateStr.split('-').map(Number);
    const parsedDate = new Date(y, m - 1, d);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.getFullYear() !== y ||
      parsedDate.getMonth() !== m - 1 ||
      parsedDate.getDate() !== d
    ) {
      errors.scheduled_date = 'Enter a valid calendar date.';
    }
  }

  const timeStr = (input.start_time || '').trim();
  if (!timeStr) {
    errors.start_time = 'Select a start time (HH:MM).';
  } else if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr)) {
    errors.start_time = 'Start time must use 24-hour HH:MM format (e.g., 14:30).';
  }

  const duration = Number(input.duration_minutes);
  if (!Number.isFinite(duration) || duration < 15 || duration > 360) {
    errors.duration_minutes = 'Duration must be between 15 and 360 minutes.';
  }

  const urlCheck = validateZoomMeetingUrl(input.meeting_url || '');
  if (!urlCheck.valid) {
    errors.meeting_url = urlCheck.error;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Computes the 3-letter weekday used by MindMate's Weekly Planner ('Mon'..'Sun')
 * from a local YYYY-MM-DD date string without UTC timezone drift.
 */
export function getPlannerWeekdayLabel(scheduledDate: string): string {
  const [y, m, d] = scheduledDate.split('-').map(Number);
  if (!y || !m || !d) return 'Mon';
  const localDate = new Date(y, m - 1, d);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return weekdays[localDate.getDay()] || 'Mon';
}

function readLocalZoomClasses(userId: string): ZoomClassItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getZoomStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalZoomClasses(userId: string, items: ZoomClassItem[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getZoomStorageKey(userId), JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Synchronizes a Zoom class with the user's Weekly Planner (`planner_tasks`)
 * using a deterministic task ID (`zoom-class-${classId}`) so repeated edits
 * never create duplicate planner events.
 */
export async function syncZoomClassToPlanner(
  userId: string,
  zoomClass: ZoomClassItem
): Promise<void> {
  const plannerTaskId = zoomClass.planner_task_id || getDeterministicPlannerTaskId(zoomClass.id);
  const dayLabel = getPlannerWeekdayLabel(zoomClass.scheduled_date);
  const taskName = `[Zoom ${zoomClass.start_time}] ${zoomClass.title}`;
  const durationLabel = `${zoomClass.duration_minutes} min`;

  // 1. Update local planner storage deterministically
  if (typeof localStorage !== 'undefined') {
    try {
      const key = getPlannerStorageKey(userId);
      const raw = localStorage.getItem(key);
      const existing: Array<Record<string, unknown>> = raw ? JSON.parse(raw) : [];
      const filtered = existing.filter((t) => String(t.id) !== plannerTaskId);

      if (zoomClass.status !== 'cancelled') {
        filtered.push({
          id: plannerTaskId,
          user_id: userId,
          day: dayLabel,
          name: taskName,
          duration: durationLabel,
          type: 'zoom',
          completed: zoomClass.status === 'completed',
          priority: 'high',
          due_date: zoomClass.scheduled_date,
        });
      }
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch {
      // Ignore localStorage errors
    }
  }

  // 2. If Supabase is configured for a valid UUID user, sync to cloud planner_tasks if reachable
  if (canSyncUserToSupabase(userId)) {
    try {
      if (zoomClass.status === 'cancelled') {
        await supabase
          .from('planner_tasks')
          .delete()
          .eq('id', plannerTaskId)
          .eq('user_id', userId);
      } else {
        await supabase.from('planner_tasks').upsert(
          {
            id: plannerTaskId,
            user_id: userId,
            day: dayLabel,
            name: taskName,
            duration: durationLabel,
            type: 'zoom',
            completed: zoomClass.status === 'completed',
          },
          { onConflict: 'id' }
        );
      }
    } catch {
      // Local planner fallback already updated
    }
  }
}

export async function removeZoomClassFromPlanner(
  userId: string,
  classId: string
): Promise<void> {
  const plannerTaskId = getDeterministicPlannerTaskId(classId);
  if (typeof localStorage !== 'undefined') {
    try {
      const key = getPlannerStorageKey(userId);
      const raw = localStorage.getItem(key);
      if (raw) {
        const existing: Array<Record<string, unknown>> = JSON.parse(raw);
        const filtered = existing.filter((t) => String(t.id) !== plannerTaskId);
        localStorage.setItem(key, JSON.stringify(filtered));
      }
    } catch {
      // Ignore
    }
  }

  if (canSyncUserToSupabase(userId)) {
    try {
      await supabase
        .from('planner_tasks')
        .delete()
        .eq('id', plannerTaskId)
        .eq('user_id', userId);
    } catch {
      // Ignore
    }
  }
}

function sortZoomClasses(items: ZoomClassItem[]): ZoomClassItem[] {
  return [...items].sort((a, b) => {
    const dtA = `${a.scheduled_date}T${a.start_time}`;
    const dtB = `${b.scheduled_date}T${b.start_time}`;
    return dtA.localeCompare(dtB);
  });
}

export async function listZoomClasses(userId: string): Promise<{
  data: ZoomClassItem[];
  persistenceSource: 'cloud' | 'local';
  error: string | null;
}> {
  if (!userId) {
    return { data: [], persistenceSource: 'local', error: null };
  }

  const localItems = readLocalZoomClasses(userId);

  if (!canSyncUserToSupabase(userId)) {
    return {
      data: sortZoomClasses(localItems),
      persistenceSource: 'local',
      error: null,
    };
  }

  try {
    const { data, error } = await supabase
      .from('zoom_classes')
      .select('*')
      .eq('user_id', userId)
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      return {
        data: sortZoomClasses(localItems),
        persistenceSource: 'local',
        error: error.message,
      };
    }

    const cloudItems: ZoomClassItem[] = (data || []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      user_id: String(row.user_id),
      title: String(row.title || ''),
      description: String(row.description || ''),
      instructor_name: String(row.instructor_name || ''),
      scheduled_date: String(row.scheduled_date || ''),
      start_time: String(row.start_time || ''),
      duration_minutes: Number(row.duration_minutes || 60),
      meeting_url: String(row.meeting_url || ''),
      topic_id: String(row.topic_id || 'python-functions'),
      status: (row.status as ZoomClassStatus) || 'upcoming',
      planner_task_id:
        String(row.planner_task_id || '') || getDeterministicPlannerTaskId(String(row.id)),
      persistence_source: 'cloud',
      created_at: String(row.created_at || new Date().toISOString()),
      updated_at: String(row.updated_at || new Date().toISOString()),
    }));

    // Merge any unsynced local-only items by ID without duplicating
    const byId = new Map<string, ZoomClassItem>();
    for (const item of localItems) {
      byId.set(item.id, item);
    }
    for (const item of cloudItems) {
      byId.set(item.id, item);
    }
    const merged = sortZoomClasses(Array.from(byId.values()));
    writeLocalZoomClasses(userId, merged);

    return {
      data: merged,
      persistenceSource: 'cloud',
      error: null,
    };
  } catch (err: unknown) {
    return {
      data: sortZoomClasses(localItems),
      persistenceSource: 'local',
      error: err instanceof Error ? err.message : 'Unable to reach Supabase cloud.',
    };
  }
}

export async function createZoomClass(
  userId: string,
  input: ZoomClassInput
): Promise<{
  data: ZoomClassItem | null;
  error: string | null;
  validationErrors?: Partial<Record<keyof ZoomClassInput, string>>;
}> {
  if (!userId) {
    return { data: null, error: 'Authenticated user session required.' };
  }

  const validation = validateZoomClassInput(input);
  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0] || 'Invalid Zoom class fields.';
    return {
      data: null,
      error: firstError,
      validationErrors: validation.errors,
    };
  }

  const urlCheck = validateZoomMeetingUrl(input.meeting_url);
  const nowIso = new Date().toISOString();
  const id = `zoom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const plannerTaskId = getDeterministicPlannerTaskId(id);

  let persistenceSource: 'cloud' | 'local' = 'local';

  const newItem: ZoomClassItem = {
    id,
    user_id: userId,
    title: input.title.trim(),
    description: (input.description || '').trim(),
    instructor_name: (input.instructor_name || '').trim(),
    scheduled_date: input.scheduled_date.trim(),
    start_time: input.start_time.trim(),
    duration_minutes: Number(input.duration_minutes),
    meeting_url: urlCheck.normalizedUrl,
    topic_id: input.topic_id || 'python-functions',
    status: input.status || 'upcoming',
    planner_task_id: plannerTaskId,
    persistence_source: 'local',
    created_at: nowIso,
    updated_at: nowIso,
  };

  if (canSyncUserToSupabase(userId)) {
    try {
      const { error } = await supabase.from('zoom_classes').insert({
        id: newItem.id,
        user_id: newItem.user_id,
        title: newItem.title,
        description: newItem.description,
        instructor_name: newItem.instructor_name,
        scheduled_date: newItem.scheduled_date,
        start_time: newItem.start_time,
        duration_minutes: newItem.duration_minutes,
        meeting_url: newItem.meeting_url,
        topic_id: newItem.topic_id,
        status: newItem.status,
        planner_task_id: newItem.planner_task_id,
        created_at: newItem.created_at,
        updated_at: newItem.updated_at,
      });
      if (!error) {
        persistenceSource = 'cloud';
      }
    } catch {
      persistenceSource = 'local';
    }
  }

  newItem.persistence_source = persistenceSource;

  const existing = readLocalZoomClasses(userId).filter((c) => c.id !== newItem.id);
  writeLocalZoomClasses(userId, sortZoomClasses([...existing, newItem]));

  await syncZoomClassToPlanner(userId, newItem);

  return { data: newItem, error: null };
}

export async function updateZoomClass(
  userId: string,
  classId: string,
  updates: Partial<ZoomClassInput>
): Promise<{
  data: ZoomClassItem | null;
  error: string | null;
  validationErrors?: Partial<Record<keyof ZoomClassInput, string>>;
}> {
  if (!userId || !classId) {
    return { data: null, error: 'User ID and Class ID are required.' };
  }

  const existingList = readLocalZoomClasses(userId);
  const current = existingList.find((c) => c.id === classId);
  if (!current) {
    return { data: null, error: 'Zoom class not found.' };
  }

  const mergedInput: ZoomClassInput = {
    title: updates.title !== undefined ? updates.title : current.title,
    description: updates.description !== undefined ? updates.description : current.description,
    instructor_name:
      updates.instructor_name !== undefined ? updates.instructor_name : current.instructor_name,
    scheduled_date:
      updates.scheduled_date !== undefined ? updates.scheduled_date : current.scheduled_date,
    start_time: updates.start_time !== undefined ? updates.start_time : current.start_time,
    duration_minutes:
      updates.duration_minutes !== undefined
        ? Number(updates.duration_minutes)
        : current.duration_minutes,
    meeting_url: updates.meeting_url !== undefined ? updates.meeting_url : current.meeting_url,
    topic_id: updates.topic_id !== undefined ? updates.topic_id : current.topic_id,
    status: updates.status !== undefined ? updates.status : current.status,
  };

  const validation = validateZoomClassInput(mergedInput);
  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0] || 'Invalid Zoom class fields.';
    return {
      data: null,
      error: firstError,
      validationErrors: validation.errors,
    };
  }

  const urlCheck = validateZoomMeetingUrl(mergedInput.meeting_url);
  const updatedAt = new Date().toISOString();
  let persistenceSource: 'cloud' | 'local' = 'local';

  const updatedItem: ZoomClassItem = {
    ...current,
    title: mergedInput.title.trim(),
    description: (mergedInput.description || '').trim(),
    instructor_name: (mergedInput.instructor_name || '').trim(),
    scheduled_date: mergedInput.scheduled_date.trim(),
    start_time: mergedInput.start_time.trim(),
    duration_minutes: Number(mergedInput.duration_minutes),
    meeting_url: urlCheck.normalizedUrl,
    topic_id: mergedInput.topic_id || 'python-functions',
    status: mergedInput.status || 'upcoming',
    planner_task_id: current.planner_task_id || getDeterministicPlannerTaskId(classId),
    updated_at: updatedAt,
  };

  if (canSyncUserToSupabase(userId)) {
    try {
      const { error } = await supabase
        .from('zoom_classes')
        .update({
          title: updatedItem.title,
          description: updatedItem.description,
          instructor_name: updatedItem.instructor_name,
          scheduled_date: updatedItem.scheduled_date,
          start_time: updatedItem.start_time,
          duration_minutes: updatedItem.duration_minutes,
          meeting_url: updatedItem.meeting_url,
          topic_id: updatedItem.topic_id,
          status: updatedItem.status,
          updated_at: updatedItem.updated_at,
        })
        .eq('id', classId)
        .eq('user_id', userId);

      if (!error) {
        persistenceSource = 'cloud';
      }
    } catch {
      persistenceSource = 'local';
    }
  }

  updatedItem.persistence_source = persistenceSource;

  const nextList = sortZoomClasses(
    existingList.map((c) => (c.id === classId ? updatedItem : c))
  );
  writeLocalZoomClasses(userId, nextList);

  await syncZoomClassToPlanner(userId, updatedItem);

  return { data: updatedItem, error: null };
}

export async function deleteZoomClass(
  userId: string,
  classId: string
): Promise<{ error: string | null }> {
  if (!userId || !classId) {
    return { error: 'User ID and Class ID are required.' };
  }

  const existingList = readLocalZoomClasses(userId).filter((c) => c.id !== classId);
  writeLocalZoomClasses(userId, existingList);

  await removeZoomClassFromPlanner(userId, classId);

  if (canSyncUserToSupabase(userId)) {
    try {
      await supabase
        .from('zoom_classes')
        .delete()
        .eq('id', classId)
        .eq('user_id', userId);
    } catch {
      // Local deletion already succeeded
    }
  }

  return { error: null };
}
