import { isSupabaseConfigured, supabase } from './supabase';
import {
  ANALYTICS_UPDATED_EVENT,
  normalizeAttemptRecord,
  readLocalAttempts,
  recordVerifiedAttempt,
  writeLocalAttempts,
} from '../services/assessment/assessmentService';
import type { AttemptType, PersistenceStatus } from '../services/assessment/types';

// PROFILES
export async function getProfile(userId: string) {
  return supabase.from('profiles').select('*').eq('id', userId).single();
}

export async function updateProfile(userId: string, data: Partial<{
  name: string; goal: string; learning_style: string; preferred_session: string;
  avatar: string; bio: string; theme: string; settings: any; streak?: number;
}>) {
  return supabase.from('profiles').update({ ...data, updated_at: new Date().toISOString() }).eq('id', userId);
}

export async function recordStudyActivity(userId: string, _topicName?: string, _minutes?: number, _activityType?: string) {
  try {
    const { data: prof } = await getProfile(userId);
    if (prof) {
      const currentStreak = (prof.streak || 0) + 1;
      await updateProfile(userId, { streak: currentStreak });
    }
  } catch (err) {
    console.warn('Failed to update streak in profile', err);
  }
}


// TOPICS
export async function getTopics(userId: string) {
  return supabase.from('topics').select('*').eq('user_id', userId).order('name');
}

export async function updateTopicMastery(id: string, mastery: number) {
  const status = mastery >= 86 ? 'mastered' : mastery >= 71 ? 'strong' : mastery >= 51 ? 'developing' : mastery >= 31 ? 'needs-work' : 'critical';
  return supabase.from('topics').update({ mastery, status, updated_at: new Date().toISOString() }).eq('id', id);
}

// CHAT
export async function getChatHistory(userId: string, limit = 20) {
  return supabase.from('chat_messages').select('*').eq('user_id', userId).order('created_at', { ascending: true }).limit(limit);
}

export async function saveChatMessage(userId: string, role: string, content: string, topic?: string) {
  return supabase.from('chat_messages').insert({ user_id: userId, role, content, topic });
}

// QUIZ
export interface QuizSessionPayload {
  topic: string;
  topic_id?: string;
  quiz_id?: string;
  attempt_type?: AttemptType;
  session_id?: string;
  client_session_id?: string;
  score: number;
  total: number;
  accuracy: number;
  main_gap?: string;
  difficulty_start?: number;
  difficulty_end?: number;
  duration_ms?: number;
}

const getQuizSessionsStorageKey = (userId: string) => `mindmate_quiz_sessions_${userId}`;

export function getStoredQuizSessions(userId: string): Array<QuizSessionPayload & { id: string; user_id: string; completed_at: string; persistence_source: 'cloud' | 'local' }> {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(getQuizSessionsStorageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredQuizSessions(
  userId: string,
  sessions: Array<QuizSessionPayload & { id: string; user_id: string; completed_at: string; persistence_source: 'cloud' | 'local' }>
) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(getQuizSessionsStorageKey(userId), JSON.stringify(sessions));
  } catch {}
}

export async function saveQuizSession(userId: string, data: QuizSessionPayload): Promise<{
  data: any;
  error: any;
  persistenceStatus: PersistenceStatus;
  message: string;
}> {
  const effectiveUserId = userId || 'guest';
  const clientSessionId = data.client_session_id || data.session_id || `session-${Date.now()}`;
  const stored = getStoredQuizSessions(effectiveUserId);
  const existingIdx = stored.findIndex(
    (s) => (s.client_session_id && s.client_session_id === clientSessionId) || (s.session_id && s.session_id === clientSessionId)
  );

  const sessionRecord =
    existingIdx >= 0
      ? stored[existingIdx]
      : {
          ...data,
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `qs-${Date.now()}`,
          user_id: effectiveUserId,
          client_session_id: clientSessionId,
          completed_at: new Date().toISOString(),
          persistence_source: 'local' as const,
        };

  if (existingIdx < 0) {
    setStoredQuizSessions(effectiveUserId, [sessionRecord, ...stored]);
  }

  if (!isSupabaseConfigured || !userId || userId === 'guest') {
    return {
      data: sessionRecord,
      error: null,
      persistenceStatus: 'saved_local_only',
      message: !isSupabaseConfigured
        ? 'Quiz session saved locally. Cloud persistence is unavailable because Supabase is not configured.'
        : 'Quiz session saved locally on this device.',
    };
  }

  try {
    const baseInsert = {
      user_id: userId,
      topic: data.topic,
      score: data.score,
      total: data.total,
      accuracy: data.accuracy,
      main_gap: data.main_gap,
    };
    const res = await supabase.from('quiz_sessions').insert(baseInsert).select().single();
    if (res.error) {
      return {
        data: sessionRecord,
        error: res.error,
        persistenceStatus: 'failed',
        message: `Failed to save quiz session to cloud (${res.error.message}). Preserved locally.`,
      };
    }

    const updatedSessions = getStoredQuizSessions(effectiveUserId).map((s) =>
      s.client_session_id === clientSessionId ? { ...s, persistence_source: 'cloud' as const } : s
    );
    setStoredQuizSessions(effectiveUserId, updatedSessions);

    return {
      data: res.data || sessionRecord,
      error: null,
      persistenceStatus: 'saved_cloud',
      message: 'Quiz session saved to Supabase cloud.',
    };
  } catch (err: any) {
    return {
      data: sessionRecord,
      error: err,
      persistenceStatus: 'failed',
      message: `Cloud save failed (${err?.message || 'Network error'}). Preserved locally.`,
    };
  }
}

export async function getQuizHistory(userId: string) {
  const local = getStoredQuizSessions(userId || 'guest');
  if (!isSupabaseConfigured || !userId || userId === 'guest') {
    return { data: local.slice(0, 10), error: null };
  }
  try {
    const res = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(10);
    if (!res.error && res.data && res.data.length > 0) {
      return res;
    }
  } catch {}
  return { data: local.slice(0, 10), error: null };
}

// ==========================================
// PLANNER FULL CRUD (SUPABASE + RESILIENT STORE)
// ==========================================

export interface PlannerTaskData {
  id?: string;
  user_id: string;
  day: string;
  name: string;
  duration: string;
  type: string;
  completed?: boolean;
  priority?: 'low' | 'medium' | 'high';
  due_date?: string;
  week_start?: string;
  created_at?: string;
  activity_completed?: boolean;
  activity_type?: string;
  topic?: string;
}

const getPlannerStorageKey = (userId: string) => `mindmate_planner_tasks_${userId}`;

const getStoredTasks = (userId: string): PlannerTaskData[] => {
  try {
    const raw = localStorage.getItem(getPlannerStorageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const setStoredTasks = (userId: string, tasks: PlannerTaskData[]) => {
  try {
    localStorage.setItem(getPlannerStorageKey(userId), JSON.stringify(tasks));
  } catch (e) {
    console.warn('Failed to save tasks to local store', e);
  }
};

export async function getPlannerTasks(userId: string) {
  try {
    const res = await supabase.from('planner_tasks').select('*').eq('user_id', userId).order('created_at');
    if (res.error) throw res.error;
    if (res.data) {
      setStoredTasks(userId, res.data);
      return { data: res.data, error: null };
    }
  } catch (err: any) {
    // If Supabase table is not yet created or offline, use resilient local store
    const local = getStoredTasks(userId);
    return { data: local, error: null };
  }
  return { data: getStoredTasks(userId), error: null };
}

export async function createPlannerTask(task: PlannerTaskData) {
  const newTask: PlannerTaskData = {
    ...task,
    id: task.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}`),
    completed: task.completed || false,
    priority: task.priority || 'medium',
    created_at: new Date().toISOString()
  };

  // Always update local storage first
  const current = getStoredTasks(task.user_id);
  setStoredTasks(task.user_id, [...current, newTask]);

  try {
    const { data, error } = await supabase.from('planner_tasks').insert({
      id: newTask.id,
      user_id: newTask.user_id,
      day: newTask.day,
      name: newTask.name,
      duration: newTask.duration,
      type: newTask.type,
      completed: newTask.completed,
      priority: newTask.priority,
      due_date: newTask.due_date || null
    }).select().single();

    if (!error && data) {
      return { data, error: null };
    }
  } catch (err) {
    // Handled by local fallback
  }

  return { data: newTask, error: null };
}

export async function updatePlannerTask(id: string, completed: boolean, userId?: string) {
  if (userId) {
    const current = getStoredTasks(userId);
    const updated = current.map(t => t.id === id ? { ...t, completed } : t);
    setStoredTasks(userId, updated);
  }

  try {
    const res = await supabase.from('planner_tasks').update({ completed, updated_at: new Date().toISOString() }).eq('id', id);
    if (!res.error) return res;
  } catch (err) {
    // Handled
  }
  return { data: { id, completed }, error: null };
}

export async function updatePlannerTaskDetails(id: string, updates: Partial<PlannerTaskData>, userId?: string) {
  if (userId) {
    const current = getStoredTasks(userId);
    const updated = current.map(t => t.id === id ? { ...t, ...updates } : t);
    setStoredTasks(userId, updated);
  }

  try {
    const res = await supabase.from('planner_tasks').update({
      ...updates,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (!res.error) return res;
  } catch (err) {
    // Handled
  }
  return { data: { id, ...updates }, error: null };
}

export async function deletePlannerTask(id: string, userId?: string) {
  if (userId) {
    const current = getStoredTasks(userId);
    setStoredTasks(userId, current.filter(t => t.id !== id));
  }

  try {
    const res = await supabase.from('planner_tasks').delete().eq('id', id);
    if (!res.error) return res;
  } catch (err) {
    // Handled
  }
  return { data: { id }, error: null };
}

export async function batchCreatePlannerTasks(userId: string, tasks: Omit<PlannerTaskData, 'user_id'>[]) {
  const tasksWithUser: PlannerTaskData[] = tasks.map(t => ({
    ...t,
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `task-${Math.random()}-${Date.now()}`,
    user_id: userId,
    completed: false,
    priority: t.priority || 'medium',
    created_at: new Date().toISOString()
  }));

  const existing = getStoredTasks(userId);
  setStoredTasks(userId, [...existing, ...tasksWithUser]);

  try {
    const { data, error } = await supabase.from('planner_tasks').insert(
      tasksWithUser.map(t => ({
        id: t.id,
        user_id: t.user_id,
        day: t.day,
        name: t.name,
        duration: t.duration,
        type: t.type,
        completed: t.completed,
        priority: t.priority
      }))
    ).select();
    if (!error && data) return { data, error: null };
  } catch (err) {
    // Handled
  }

  return { data: tasksWithUser, error: null };
}

// ==========================================
// FRIENDS & NETWORKING FULL FUNCTIONALITY
// ==========================================

export interface FriendRequestData {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at?: string;
  sender?: { id: string; name: string; email: string; avatar?: string; streak?: number; overall_mastery?: number };
  receiver?: { id: string; name: string; email: string; avatar?: string; streak?: number; overall_mastery?: number };
}

const getFriendsStorageKey = (userId: string) => `mindmate_friends_${userId}`;
const getFriendRequestsStorageKey = (userId: string) => `mindmate_friend_requests_${userId}`;

const getStoredFriends = (userId: string) => {
  try {
    const raw = localStorage.getItem(getFriendsStorageKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const setStoredFriends = (userId: string, friends: any[]) => {
  try { localStorage.setItem(getFriendsStorageKey(userId), JSON.stringify(friends)); } catch {}
};

const getStoredRequests = (userId: string): FriendRequestData[] => {
  try {
    const raw = localStorage.getItem(getFriendRequestsStorageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const setStoredRequests = (userId: string, requests: FriendRequestData[]) => {
  try { localStorage.setItem(getFriendRequestsStorageKey(userId), JSON.stringify(requests)); } catch {}
};

export async function searchProfiles(query: string, currentUserId: string) {
  if (!query || query.trim().length < 1) return { data: [], error: null };
  const clean = query.trim().toLowerCase();

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, avatar, streak, overall_mastery')
      .neq('id', currentUserId)
      .ilike('name', `%${clean}%`)
      .limit(10);

    if (!error && data) return { data, error: null };
  } catch {}

  return { data: [], error: null };
}

export async function getFriendsList(userId: string) {
  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select(`
        id, sender_id, receiver_id, status, created_at,
        sender:profiles!friend_requests_sender_id_fkey(id, name, email, avatar, streak, overall_mastery),
        receiver:profiles!friend_requests_receiver_id_fkey(id, name, email, avatar, streak, overall_mastery)
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (!error && data) {
      const friends = data.map((item: any) => {
        const isSender = item.sender_id === userId;
        const profile = isSender ? item.receiver : item.sender;
        return {
          id: profile?.id || item.id,
          requestId: item.id,
          name: profile?.name || 'Study Partner',
          email: profile?.email || '',
          avatar: profile?.avatar || '/avatars/avatar-01.webp',
          streak: profile?.streak ?? 8,
          mastery: profile?.overall_mastery ?? 70,
          subject: 'Computer Science',
          isCustom: true
        };
      });
      setStoredFriends(userId, friends);
      return { data: friends, error: null };
    }
  } catch {}

  const stored = getStoredFriends(userId);
  return { data: stored, error: null };
}

export async function getPendingRequests(userId: string) {
  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select(`
        id, sender_id, receiver_id, status, created_at,
        sender:profiles!friend_requests_sender_id_fkey(id, name, email, avatar, streak, overall_mastery)
      `)
      .eq('receiver_id', userId)
      .eq('status', 'pending');

    if (!error && data) {
      return { data, error: null };
    }
  } catch {}

  const stored = getStoredRequests(userId).filter(r => r.receiver_id === userId && r.status === 'pending');
  return { data: stored, error: null };
}

export async function getSentRequests(userId: string) {
  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select(`
        id, sender_id, receiver_id, status, created_at,
        receiver:profiles!friend_requests_receiver_id_fkey(id, name, email, avatar, streak, overall_mastery)
      `)
      .eq('sender_id', userId)
      .eq('status', 'pending');

    if (!error && data) {
      return { data, error: null };
    }
  } catch {}

  const stored = getStoredRequests(userId).filter(r => r.sender_id === userId && r.status === 'pending');
  return { data: stored, error: null };
}

export async function sendFriendRequest(sender: any, receiver: any) {
  const reqId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`;
  const newReq: FriendRequestData = {
    id: reqId,
    sender_id: sender.id,
    receiver_id: receiver.id,
    status: 'pending',
    created_at: new Date().toISOString(),
    sender: { id: sender.id, name: sender.name, email: sender.email, avatar: sender.avatar },
    receiver: { id: receiver.id, name: receiver.name, email: receiver.email, avatar: receiver.avatar }
  };

  const senderReqs = getStoredRequests(sender.id);
  setStoredRequests(sender.id, [...senderReqs, newReq]);

  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .insert({
        id: reqId,
        sender_id: sender.id,
        receiver_id: receiver.id,
        status: 'pending'
      })
      .select()
      .single();

    if (!error && data) return { data, error: null };
  } catch {}

  return { data: newReq, error: null };
}

export async function respondToFriendRequest(requestId: string, status: 'accepted' | 'rejected', currentUserId: string, otherUser?: any) {
  const stored = getStoredRequests(currentUserId);
  const updated = stored.map(r => r.id === requestId ? { ...r, status } : r);
  setStoredRequests(currentUserId, updated);

  if (status === 'accepted' && otherUser) {
    const friends = getStoredFriends(currentUserId) || [];
    const newFriend = {
      id: otherUser.id,
      requestId,
      name: otherUser.name,
      email: otherUser.email,
      avatar: otherUser.avatar || '/avatars/avatar-01.webp',
      streak: otherUser.streak ?? 10,
      mastery: otherUser.mastery ?? 75,
      subject: 'Computer Science',
      isCustom: true
    };
    if (!friends.some((f: any) => f.id === otherUser.id)) {
      setStoredFriends(currentUserId, [...friends, newFriend]);
    }
  }

  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select();

    if (!error && data) return { data, error: null };
  } catch {}

  return { data: { id: requestId, status }, error: null };
}

export async function cancelFriendRequest(requestId: string, userId: string) {
  const stored = getStoredRequests(userId);
  setStoredRequests(userId, stored.filter(r => r.id !== requestId));

  try {
    const res = await supabase.from('friend_requests').delete().eq('id', requestId);
    if (!res.error) return res;
  } catch {}

  return { data: { id: requestId }, error: null };
}

export async function removeFriend(friendId: string, userId: string) {
  const stored = getStoredFriends(userId) || [];
  setStoredFriends(userId, stored.filter((f: any) => f.id !== friendId));

  try {
    await supabase.from('friend_requests').delete().or(`and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`);
  } catch {}

  return { data: { id: friendId }, error: null };
}

// MATERIALS
export async function getMaterials(userId: string) {
  return supabase.from('materials').select('*').eq('user_id', userId).order('created_at', { ascending: false });
}

export async function saveMaterial(userId: string, data: { name: string; type: string; raw_content: string; summary?: string; key_concepts?: string }) {
  return supabase.from('materials').insert({ user_id: userId, ...data, status: 'ready' });
}

export async function deleteMaterial(id: string) {
  return supabase.from('materials').delete().eq('id', id);
}

// INSIGHTS
export async function getInsights(userId: string) {
  return supabase.from('insights').select('*').eq('user_id', userId).order('created_at', { ascending: false });
}

export async function markInsightRead(id: string) {
  return supabase.from('insights').update({ is_read: true }).eq('id', id);
}

// ==========================================
// PLANNER ACTIVITY VALIDATION HELPER
// ==========================================

export async function completePlannerTaskActivity(taskId: string, userId: string, activityType?: string) {
  const current = getStoredTasks(userId);
  const updated = current.map((t) =>
    t.id === taskId
      ? { ...t, completed: true, activity_completed: true, activity_type: activityType || t.activity_type || t.type }
      : t
  );
  setStoredTasks(userId, updated);

  try {
    const res = await supabase
      .from('planner_tasks')
      .update({
        completed: true,
        activity_completed: true,
        activity_type: activityType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);
    if (!res.error) return res;
  } catch (err) {
    // Local store is already updated
  }
  return { data: { id: taskId, completed: true, activity_completed: true }, error: null };
}

// ==========================================
// USER QUESTION ATTEMPTS & MISTAKE REVIEWS
// ==========================================

export interface QuestionAttempt {
  id: string;
  user_id: string;
  client_attempt_id?: string;
  quiz_id?: string;
  attempt_type?: AttemptType;
  session_id?: string;
  question_id: string;
  subject_id: string;
  topic_id: string;
  topic_name?: string;
  concept_tag?: string;
  difficulty: number;
  question_text: string;
  selected_option: number;
  correct_option: number;
  is_correct: boolean;
  explanation: string;
  options?: string[];
  response_duration_ms?: number;
  attempted_at: string;
  resolved?: boolean;
  persistence_source?: 'cloud' | 'local';
}

export const getStoredAttempts = (userId: string): QuestionAttempt[] => {
  return readLocalAttempts(userId);
};

export const setStoredAttempts = (userId: string, attempts: QuestionAttempt[]) => {
  writeLocalAttempts(
    userId,
    attempts.map((a) => normalizeAttemptRecord(a as unknown as Record<string, unknown>))
  );
};

export async function recordQuestionAttempt(
  userId: string,
  attempt: Omit<QuestionAttempt, 'id' | 'user_id' | 'attempted_at'>
) {
  const result = await recordVerifiedAttempt({
    user_id: userId,
    client_attempt_id: attempt.client_attempt_id,
    quiz_id: attempt.quiz_id,
    attempt_type: attempt.attempt_type,
    session_id: attempt.session_id,
    subject_id: attempt.subject_id,
    topic_id: attempt.topic_id,
    topic_name: attempt.topic_name,
    concept_tag: attempt.concept_tag,
    question_id: attempt.question_id,
    question_text: attempt.question_text,
    options: attempt.options || [],
    selected_option: attempt.selected_option,
    correct_option: attempt.correct_option,
    is_correct: attempt.is_correct,
    difficulty: attempt.difficulty,
    explanation: attempt.explanation,
    response_duration_ms: attempt.response_duration_ms,
  });

  return {
    data: result.attempt,
    error: result.status === 'failed' ? new Error(result.error || result.message) : null,
    persistenceStatus: result.status,
    topicMastery: result.topicMastery,
    duplicate: result.duplicate,
    message: result.message,
  };
}

export async function getUserMistakes(userId: string) {
  const effectiveUserId = userId || 'guest';
  if (isSupabaseConfigured && userId && userId !== 'guest') {
    try {
      const { data, error } = await supabase
        .from('user_question_attempts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_correct', false)
        .order('attempted_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return { data, error: null };
      }
    } catch {}
  }

  const local = getStoredAttempts(effectiveUserId)
    .filter((a) => !a.is_correct)
    .sort((a, b) => (Date.parse(b.attempted_at) || 0) - (Date.parse(a.attempted_at) || 0));
  return { data: local, error: null };
}

export async function resolveMistake(userId: string, attemptId: string) {
  const effectiveUserId = userId || 'guest';
  const stored = getStoredAttempts(effectiveUserId);
  const updated = stored.map((a) => (a.id === attemptId ? { ...a, resolved: true } : a));
  setStoredAttempts(effectiveUserId, updated);

  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ANALYTICS_UPDATED_EVENT, { detail: { userId: effectiveUserId } }));
    }
  } catch {}

  if (isSupabaseConfigured && userId && userId !== 'guest') {
    try {
      const { data, error } = await supabase
        .from('user_question_attempts')
        .update({ resolved: true })
        .eq('id', attemptId);
      if (!error) return { data, error: null };
    } catch {}
  }

  return { data: { id: attemptId, resolved: true }, error: null };
}

// ==========================================
// FLASHCARD PROGRESS
// ==========================================

export interface FlashcardProgress {
  id: string;
  user_id: string;
  card_id: string;
  topic_id: string;
  status: 'learning' | 'mastered';
  last_reviewed: string;
}

const getFlashcardStorageKey = (userId: string) => `mindmate_flashcards_${userId}`;

export const getStoredFlashcards = (userId: string): FlashcardProgress[] => {
  try {
    const raw = localStorage.getItem(getFlashcardStorageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const setStoredFlashcards = (userId: string, progress: FlashcardProgress[]) => {
  try {
    localStorage.setItem(getFlashcardStorageKey(userId), JSON.stringify(progress));
  } catch {}
};

export async function saveFlashcardProgress(
  userId: string,
  progress: { card_id: string; topic_id: string; status: 'learning' | 'mastered' }
) {
  const stored = getStoredFlashcards(userId);
  const existingIdx = stored.findIndex((p) => p.card_id === progress.card_id);
  const updatedItem: FlashcardProgress = {
    id: existingIdx >= 0 ? stored[existingIdx].id : `fc-${Date.now()}-${Math.random()}`,
    user_id: userId,
    card_id: progress.card_id,
    topic_id: progress.topic_id,
    status: progress.status,
    last_reviewed: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    stored[existingIdx] = updatedItem;
  } else {
    stored.push(updatedItem);
  }
  setStoredFlashcards(userId, stored);

  try {
    const { data, error } = await supabase.from('user_flashcard_progress').upsert(
      {
        user_id: userId,
        card_id: progress.card_id,
        topic_id: progress.topic_id,
        status: progress.status,
        last_reviewed: updatedItem.last_reviewed,
      },
      { onConflict: 'user_id,card_id' }
    );
    if (!error) return { data, error: null };
  } catch {}

  return { data: updatedItem, error: null };
}

export async function getUserFlashcardProgress(userId: string, topicId?: string) {
  try {
    let query = supabase.from('user_flashcard_progress').select('*').eq('user_id', userId);
    if (topicId) query = query.eq('topic_id', topicId);
    const { data, error } = await query;
    if (!error && data) return { data, error: null };
  } catch {}

  const stored = getStoredFlashcards(userId);
  const filtered = topicId ? stored.filter((c) => c.topic_id === topicId) : stored;
  return { data: filtered, error: null };
}

// ==========================================
// LEARNING WINS & MILESTONES
// ==========================================

export interface LearningWin {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: 'streak' | 'mastery' | 'quiz' | 'milestone';
  icon: string;
  metric_value?: string;
  achieved_at: string;
}

const getWinsStorageKey = (userId: string) => `mindmate_wins_${userId}`;

export const getStoredWins = (userId: string): LearningWin[] => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(getWinsStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  // Derive real milestones from actual recorded question attempts (never invent fake mastery/quiz wins)
  const attempts = readLocalAttempts(userId || 'guest');
  if (attempts.length === 0) {
    return [];
  }

  const derivedWins: LearningWin[] = [];
  const correctCount = attempts.filter((a) => a.is_correct).length;
  const accuracy = Math.round((correctCount / attempts.length) * 100);
  const latestAt = attempts[attempts.length - 1]?.attempted_at || new Date().toISOString();

  derivedWins.push({
    id: `win-attempts-${attempts.length}`,
    user_id: userId,
    title: `${attempts.length} Assessment Question${attempts.length === 1 ? '' : 's'} Completed`,
    description: `Answered ${correctCount} of ${attempts.length} questions correctly (${accuracy}% overall accuracy).`,
    category: 'quiz',
    icon: 'Trophy',
    metric_value: `${accuracy}%`,
    achieved_at: latestAt,
  });

  return derivedWins;
};

export const setStoredWins = (userId: string, wins: LearningWin[]) => {
  try {
    localStorage.setItem(getWinsStorageKey(userId), JSON.stringify(wins));
  } catch {}
};

export async function getLearningWins(userId: string) {
  try {
    const { data, error } = await supabase
      .from('learning_wins')
      .select('*')
      .eq('user_id', userId)
      .order('achieved_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return { data, error: null };
    }
  } catch {}

  return { data: getStoredWins(userId), error: null };
}

export async function recordLearningWin(
  userId: string,
  win: Omit<LearningWin, 'id' | 'user_id' | 'achieved_at'>
) {
  const newWin: LearningWin = {
    ...win,
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `win-${Date.now()}`,
    user_id: userId,
    achieved_at: new Date().toISOString(),
  };

  const stored = getStoredWins(userId);
  setStoredWins(userId, [newWin, ...stored]);

  try {
    const { data, error } = await supabase.from('learning_wins').insert(newWin).select().single();
    if (!error && data) return { data, error: null };
  } catch {}

  return { data: newWin, error: null };
}
