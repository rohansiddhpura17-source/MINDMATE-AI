import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { resolveTopicMetadata, TOPICS } from '../../data/learningContent';
import {
  calculateAllTopicsMastery,
  calculateTopicMastery,
  sortAttemptsChronologically,
} from './masteryEngine';
import { analyzeRecurringMistakes } from './mistakeAnalyzer';
import { generateEvidenceRecommendations } from './recommendationEngine';
import { determineNextLearningAction } from '../adaptive/adaptiveLearningEngine';
import {
  isDemoModeActive,
  getDemoAttempts,
  saveDemoAttempts,
} from '../demo/demoLearnerService';
import type {
  AttemptRecord,
  AttemptType,
  LearnerAnalyticsSnapshot,
  PersistenceStatus,
  TopicMasteryMetrics,
} from './types';

export const ANALYTICS_UPDATED_EVENT = 'mindmate-analytics-updated';

const LOCAL_ATTEMPTS_PREFIX = 'mindmate_attempts_';

function getStorageKey(userId: string): string {
  return `${LOCAL_ATTEMPTS_PREFIX}${userId || 'guest'}`;
}

/**
 * Safely read stored attempts from localStorage (works in both browser and Node test environments).
 * If demo mode is active, reads from the isolated demo dataset so real attempts are never modified.
 */
export function readLocalAttempts(userId: string): AttemptRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    if (isDemoModeActive(userId)) {
      return getDemoAttempts(userId);
    }
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeAttemptRecord);
  } catch {
    return [];
  }
}

/**
 * Safely write attempts to localStorage.
 * If demo mode is active, writes exclusively to the demo store without polluting real user data.
 */
export function writeLocalAttempts(userId: string, attempts: AttemptRecord[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (isDemoModeActive(userId)) {
      saveDemoAttempts(userId, attempts);
      return;
    }
    localStorage.setItem(getStorageKey(userId), JSON.stringify(attempts));
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}

export function clearLocalAttempts(userId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(getStorageKey(userId));
  } catch {
    // Ignore
  }
}

function dispatchAnalyticsUpdated(userId: string): void {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(ANALYTICS_UPDATED_EVENT, { detail: { userId } })
      );
    }
  } catch {
    // Ignore in non-DOM test environments
  }
}

/**
 * Normalize raw attempt objects (from older localStorage records or Supabase rows)
 * into a canonical AttemptRecord.
 */
export function normalizeAttemptRecord(raw: Partial<AttemptRecord> & Record<string, any>): AttemptRecord {
  const topicMeta = resolveTopicMetadata(
    String(raw.topic_id || raw.topic_name || 'python-functions')
  );
  const attemptedAt =
    typeof raw.attempted_at === 'string' && raw.attempted_at.length > 0
      ? raw.attempted_at
      : new Date().toISOString();
  const questionId = String(raw.question_id || 'q-unknown');
  const sessionId = String(raw.session_id || 'legacy-session');
  const id = String(raw.id || `${sessionId}:${questionId}`);
  const clientAttemptId = String(
    raw.client_attempt_id || `${sessionId}:${questionId}:${attemptedAt}`
  );

  return {
    id,
    client_attempt_id: clientAttemptId,
    user_id: String(raw.user_id || 'guest'),
    quiz_id: String(raw.quiz_id || `quiz-${topicMeta.id}`),
    attempt_type: (raw.attempt_type as AttemptType) || 'adaptive',
    session_id: sessionId,
    subject_id: String(raw.subject_id || topicMeta.subjectId),
    topic_id: topicMeta.id,
    topic_name: String(raw.topic_name || topicMeta.name),
    concept_tag:
      typeof raw.concept_tag === 'string' && raw.concept_tag.length > 0
        ? raw.concept_tag
        : undefined,
    question_id: questionId,
    question_text: String(raw.question_text || ''),
    options: Array.isArray(raw.options)
      ? raw.options.map((o) => String(o))
      : [],
    selected_option: Number(raw.selected_option ?? 0),
    correct_option: Number(raw.correct_option ?? 0),
    is_correct: Boolean(raw.is_correct),
    difficulty: Math.max(1, Math.min(5, Number(raw.difficulty || 1))),
    explanation: String(raw.explanation || ''),
    response_duration_ms:
      raw.response_duration_ms !== undefined && raw.response_duration_ms !== null
        ? Number(raw.response_duration_ms)
        : undefined,
    resolved: raw.resolved !== undefined ? Boolean(raw.resolved) : Boolean(raw.is_correct),
    attempted_at: attemptedAt,
    persistence_source:
      raw.persistence_source === 'cloud' ? 'cloud' : 'local',
  };
}

/**
 * Merge local and cloud attempts using `client_attempt_id` (or `id`) to eliminate duplicates.
 */
export function mergeAndDeduplicateAttempts(
  localAttempts: AttemptRecord[],
  cloudAttempts: AttemptRecord[]
): AttemptRecord[] {
  const byKey = new Map<string, AttemptRecord>();

  for (const local of localAttempts) {
    const normalized = normalizeAttemptRecord(local);
    const key = normalized.client_attempt_id || normalized.id;
    byKey.set(key, normalized);
  }

  for (const cloud of cloudAttempts) {
    const normalized = normalizeAttemptRecord({
      ...cloud,
      persistence_source: 'cloud',
    });
    const key = normalized.client_attempt_id || normalized.id;
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...existing,
        ...normalized,
        resolved: existing.resolved || normalized.resolved,
        persistence_source: 'cloud',
      });
    } else {
      byKey.set(key, normalized);
    }
  }

  return sortAttemptsChronologically(Array.from(byKey.values()));
}

export interface RecordAttemptInput {
  user_id: string;
  client_attempt_id?: string;
  quiz_id?: string;
  attempt_type?: AttemptType;
  session_id?: string;
  subject_id?: string;
  topic_id: string;
  topic_name?: string;
  concept_tag?: string;
  question_id: string;
  question_text: string;
  options: string[];
  selected_option: number;
  correct_option: number;
  is_correct: boolean;
  difficulty: number;
  explanation: string;
  response_duration_ms?: number;
  attempted_at?: string;
}

export interface RecordAttemptResult {
  status: PersistenceStatus;
  attempt: AttemptRecord;
  topicMastery: TopicMasteryMetrics;
  duplicate: boolean;
  message: string;
  error?: string;
}

/**
 * Persist a single question attempt idempotently and update topic mastery.
 *
 * Guarantees:
 * - Deduplicates via `client_attempt_id` so retries or double-clicks never create duplicate attempts.
 * - Never returns `'saved_cloud'` if Supabase is unconfigured or if the Supabase write failed.
 * - Always updates deterministic topic mastery from the updated attempt log.
 */
export async function recordVerifiedAttempt(
  input: RecordAttemptInput
): Promise<RecordAttemptResult> {
  const userId = input.user_id || 'guest';
  const topicMeta = resolveTopicMetadata(input.topic_id || input.topic_name || '');
  const sessionId = input.session_id || 'session-default';
  const clientAttemptId =
    input.client_attempt_id || `${sessionId}:${input.question_id}`;

  const existingLocal = readLocalAttempts(userId);
  const duplicateIndex = existingLocal.findIndex(
    (a) => a.client_attempt_id === clientAttemptId
  );

  let attemptRecord: AttemptRecord;
  let isDuplicate = false;

  if (duplicateIndex >= 0) {
    isDuplicate = true;
    attemptRecord = existingLocal[duplicateIndex];
    // If already synced to cloud, return immediately without duplicating
    if (attemptRecord.persistence_source === 'cloud') {
      const topicMastery = calculateTopicMastery(topicMeta.id, existingLocal);
      return {
        status: 'saved_cloud',
        attempt: attemptRecord,
        topicMastery,
        duplicate: true,
        message: 'Attempt already saved to cloud (duplicate submission prevented).',
      };
    }
  } else {
    attemptRecord = normalizeAttemptRecord({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      client_attempt_id: clientAttemptId,
      user_id: userId,
      quiz_id: input.quiz_id || `quiz-${topicMeta.id}`,
      attempt_type: input.attempt_type || 'adaptive',
      session_id: sessionId,
      subject_id: input.subject_id || topicMeta.subjectId,
      topic_id: topicMeta.id,
      topic_name: input.topic_name || topicMeta.name,
      concept_tag: input.concept_tag,
      question_id: input.question_id,
      question_text: input.question_text,
      options: input.options,
      selected_option: input.selected_option,
      correct_option: input.correct_option,
      is_correct: input.is_correct,
      difficulty: input.difficulty,
      explanation: input.explanation,
      response_duration_ms: input.response_duration_ms,
      resolved: input.is_correct,
      attempted_at: input.attempted_at || new Date().toISOString(),
      persistence_source: 'local',
    });
    existingLocal.push(attemptRecord);
    writeLocalAttempts(userId, existingLocal);
  }

  // Compute updated deterministic mastery for this topic
  const updatedTopicMastery = calculateTopicMastery(topicMeta.id, existingLocal);

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isLocalGuestUser =
    !userId || userId === 'guest' || userId.startsWith('guest-') || !UUID_REGEX.test(userId);

  // If Supabase is not configured or user is unauthenticated local guest -> local-only status
  if (!isSupabaseConfigured || isLocalGuestUser) {
    dispatchAnalyticsUpdated(userId);
    return {
      status: 'saved_local_only',
      attempt: attemptRecord,
      topicMastery: updatedTopicMastery,
      duplicate: isDuplicate,
      message: !isSupabaseConfigured
        ? 'Saved locally on this device. Cloud persistence is unavailable because Supabase is not configured.'
        : 'Saved locally on this device (sign in with a cloud account to sync to Supabase).',
    };
  }

  // Attempt cloud persistence to Supabase
  try {
    // Try full schema insert (with migration 005 columns) first, fallback to base columns if remote DB hasn't run 005 yet
    const fullRow = {
      user_id: userId,
      client_attempt_id: attemptRecord.client_attempt_id,
      quiz_id: attemptRecord.quiz_id,
      attempt_type: attemptRecord.attempt_type,
      session_id: attemptRecord.session_id,
      question_id: attemptRecord.question_id,
      subject_id: attemptRecord.subject_id,
      topic_id: attemptRecord.topic_id,
      topic_name: attemptRecord.topic_name,
      concept_tag: attemptRecord.concept_tag || null,
      difficulty: attemptRecord.difficulty,
      question_text: attemptRecord.question_text,
      selected_option: attemptRecord.selected_option,
      correct_option: attemptRecord.correct_option,
      is_correct: attemptRecord.is_correct,
      explanation: attemptRecord.explanation,
      options: attemptRecord.options,
      response_duration_ms: attemptRecord.response_duration_ms ?? null,
      resolved: attemptRecord.resolved,
      attempted_at: attemptRecord.attempted_at,
    };

    let { error } = await supabase
      .from('user_question_attempts')
      .insert(fullRow);

    if (error && error.message && /column .* does not exist/i.test(error.message)) {
      // Fallback to migration 004 base columns if migration 005 has not been applied yet
      const baseRow = {
        user_id: userId,
        question_id: attemptRecord.question_id,
        subject_id: attemptRecord.subject_id,
        topic_id: attemptRecord.topic_id,
        topic_name: attemptRecord.topic_name,
        difficulty: attemptRecord.difficulty,
        question_text: attemptRecord.question_text,
        selected_option: attemptRecord.selected_option,
        correct_option: attemptRecord.correct_option,
        is_correct: attemptRecord.is_correct,
        explanation: attemptRecord.explanation,
        options: attemptRecord.options,
        resolved: attemptRecord.resolved,
        attempted_at: attemptRecord.attempted_at,
      };
      const fallbackRes = await supabase
        .from('user_question_attempts')
        .insert(baseRow);
      error = fallbackRes.error;
    }

    if (error) {
      // Duplicate key violation on retry means it's already in Supabase
      if (error.code === '23505') {
        attemptRecord.persistence_source = 'cloud';
      } else {
        throw new Error(error.message || 'Supabase write failed');
      }
    } else {
      attemptRecord.persistence_source = 'cloud';
    }

    // Update topic mastery row in Supabase `topics` table so cloud dashboard stays in sync
    const mappedStatus =
      updatedTopicMastery.status === 'mastered' || updatedTopicMastery.status === 'strong'
        ? 'strong'
        : updatedTopicMastery.status === 'developing'
          ? 'developing'
          : 'weak';

    await supabase.from('topics').upsert(
      {
        user_id: userId,
        name: updatedTopicMastery.topicName,
        subject: updatedTopicMastery.subjectId,
        mastery: updatedTopicMastery.masteryScore,
        status: mappedStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,name' }
    );

    // Update local record to mark `persistence_source: 'cloud'`
    const currentLocal = readLocalAttempts(userId);
    const idx = currentLocal.findIndex(
      (a) => a.client_attempt_id === attemptRecord.client_attempt_id
    );
    if (idx >= 0) {
      currentLocal[idx] = { ...attemptRecord, persistence_source: 'cloud' };
      writeLocalAttempts(userId, currentLocal);
    }

    dispatchAnalyticsUpdated(userId);
    return {
      status: 'saved_cloud',
      attempt: attemptRecord,
      topicMastery: updatedTopicMastery,
      duplicate: isDuplicate,
      message: 'Saved to Supabase cloud and local cache.',
    };
  } catch (err) {
    const errMsg =
      err instanceof Error ? err.message : 'Failed to save attempt to Supabase cloud';
    dispatchAnalyticsUpdated(userId);
    return {
      status: 'failed',
      attempt: attemptRecord,
      topicMastery: updatedTopicMastery,
      duplicate: isDuplicate,
      error: errMsg,
      message: `Cloud save failed (${errMsg}). Your attempt is preserved locally and can be retried.`,
    };
  }
}

/**
 * Retry syncing any locally stored attempts that have not yet been persisted to Supabase.
 */
export async function retryUnsyncedAttempts(userId: string): Promise<{
  syncedCount: number;
  failedCount: number;
  status: PersistenceStatus;
  message: string;
}> {
  if (!isSupabaseConfigured || !userId || userId === 'guest') {
    return {
      syncedCount: 0,
      failedCount: 0,
      status: 'saved_local_only',
      message: 'Cloud persistence is unavailable because Supabase is not configured.',
    };
  }

  const localAttempts = readLocalAttempts(userId);
  const unsynced = localAttempts.filter((a) => a.persistence_source !== 'cloud');
  if (unsynced.length === 0) {
    return {
      syncedCount: 0,
      failedCount: 0,
      status: 'saved_cloud',
      message: 'All attempts are already synchronized with Supabase cloud.',
    };
  }

  let syncedCount = 0;
  let failedCount = 0;

  for (const att of unsynced) {
    const res = await recordVerifiedAttempt({
      user_id: userId,
      client_attempt_id: att.client_attempt_id,
      quiz_id: att.quiz_id,
      attempt_type: att.attempt_type,
      session_id: att.session_id,
      subject_id: att.subject_id,
      topic_id: att.topic_id,
      topic_name: att.topic_name,
      concept_tag: att.concept_tag,
      question_id: att.question_id,
      question_text: att.question_text,
      options: att.options,
      selected_option: att.selected_option,
      correct_option: att.correct_option,
      is_correct: att.is_correct,
      difficulty: att.difficulty,
      explanation: att.explanation,
      response_duration_ms: att.response_duration_ms,
      attempted_at: att.attempted_at,
    });
    if (res.status === 'saved_cloud') {
      syncedCount += 1;
    } else {
      failedCount += 1;
    }
  }

  return {
    syncedCount,
    failedCount,
    status: failedCount === 0 ? 'saved_cloud' : 'failed',
    message:
      failedCount === 0
        ? `Successfully synced ${syncedCount} attempt(s) to Supabase cloud.`
        : `Synced ${syncedCount} attempt(s); ${failedCount} attempt(s) still failed to sync.`,
  };
}

/**
 * Pure function to construct a complete LearnerAnalyticsSnapshot from an array of attempts.
 */
export function buildLearnerAnalyticsSnapshot(
  userId: string | null,
  attempts: AttemptRecord[],
  options?: {
    isSupabaseConfigured?: boolean;
    dataSource?: 'cloud_and_local' | 'local_only' | 'unauthenticated' | 'demo';
    syncError?: string | null;
    isDemoMode?: boolean;
    nowIso?: string;
  }
): LearnerAnalyticsSnapshot {
  const configured = options?.isSupabaseConfigured ?? isSupabaseConfigured;
  const chronological = sortAttemptsChronologically(attempts);
  const topics = calculateAllTopicsMastery(chronological);
  const mistakePatterns = analyzeRecurringMistakes(chronological, topics);
  const recommendations = generateEvidenceRecommendations(
    topics,
    mistakePatterns,
    options?.nowIso
  );
  const nextLearningAction = determineNextLearningAction({
    topicMetrics: topics,
    mistakePatterns,
    recommendations,
  });

  const totalAttempts = chronological.length;
  const totalCorrect = chronological.filter((a) => a.is_correct).length;
  const overallAccuracy =
    totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  const recentSlice = chronological.slice(-10);
  const recentCorrect = recentSlice.filter((a) => a.is_correct).length;
  const recentAccuracy =
    recentSlice.length > 0
      ? Math.round((recentCorrect / recentSlice.length) * 100)
      : 0;

  const assessedTopics = topics.filter((t) => t.totalAttempts > 0);
  const averageMastery =
    assessedTopics.length > 0
      ? Math.round(
          assessedTopics.reduce((sum, t) => sum + t.masteryScore, 0) /
            assessedTopics.length
        )
      : 0;

  const isDemo = options?.isDemoMode ?? (userId ? isDemoModeActive(userId) : isDemoModeActive());

  return {
    userId,
    isSupabaseConfigured: configured,
    dataSource:
      options?.dataSource ??
      (isDemo
        ? 'demo'
        : !userId
        ? 'unauthenticated'
        : configured
          ? 'cloud_and_local'
          : 'local_only'),
    syncError: options?.syncError ?? null,
    isDemoMode: isDemo,
    totalAttempts,
    totalCorrect,
    overallAccuracy,
    recentAccuracy,
    averageMastery,
    assessedTopicsCount: assessedTopics.length,
    totalTopicsCount: Math.max(TOPICS.length, topics.length),
    topics,
    mistakePatterns,
    recommendations,
    nextLearningAction,
    recentAttempts: [...chronological].reverse().slice(0, 25),
    lastUpdatedAt: options?.nowIso || new Date().toISOString(),
  };
}

/**
 * Load the authoritative LearnerAnalyticsSnapshot for a user, merging local attempts
 * with Supabase cloud attempts (when configured). Never invents fake data.
 * When demo mode is active, serves the isolated demonstration dataset.
 */
export async function loadLearnerAnalytics(
  userId?: string | null
): Promise<LearnerAnalyticsSnapshot> {
  const effectiveUserId = userId || 'meet8kotecha';

  if (isDemoModeActive(effectiveUserId)) {
    const demoAttempts = getDemoAttempts(effectiveUserId);
    return buildLearnerAnalyticsSnapshot(effectiveUserId, demoAttempts, {
      isSupabaseConfigured: false,
      dataSource: 'demo',
      isDemoMode: true,
      syncError: null,
    });
  }

  const localAttempts = readLocalAttempts(effectiveUserId);

  if (!isSupabaseConfigured || !userId || userId === 'guest') {
    return buildLearnerAnalyticsSnapshot(userId || null, localAttempts, {
      isSupabaseConfigured,
      dataSource: !userId ? 'unauthenticated' : 'local_only',
      syncError: null,
    });
  }

  try {
    const { data, error } = await supabase
      .from('user_question_attempts')
      .select('*')
      .eq('user_id', userId)
      .order('attempted_at', { ascending: true })
      .limit(500);

    if (error) {
      return buildLearnerAnalyticsSnapshot(userId, localAttempts, {
        isSupabaseConfigured: true,
        dataSource: 'local_only',
        syncError: error.message,
      });
    }

    const cloudAttempts = (data || []).map((row) =>
      normalizeAttemptRecord({
        ...(row as Record<string, unknown>),
        persistence_source: 'cloud',
      })
    );
    const merged = mergeAndDeduplicateAttempts(localAttempts, cloudAttempts);
    writeLocalAttempts(userId, merged);

    return buildLearnerAnalyticsSnapshot(userId, merged, {
      isSupabaseConfigured: true,
      dataSource: 'cloud_and_local',
      syncError: null,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Unable to reach Supabase cloud';
    return buildLearnerAnalyticsSnapshot(userId, localAttempts, {
      isSupabaseConfigured: true,
      dataSource: 'local_only',
      syncError: msg,
    });
  }
}
