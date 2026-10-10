import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { apiClient } from '../services/api/client';
import { syncQueue } from '../services/storage/syncQueue';

export type StudyStreak = {
  currentStreak: number;
  longestStreak: number;
  studyDates: string[];
  lastStudyDate: string | null;
};

function getToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStorageKey(userId?: string | null): string {
  return `mindmate-study-streak:${userId || 'guest'}`;
}

function loadLocalStreak(userId?: string | null): StudyStreak {
  try {
    const key = getStorageKey(userId);
    const saved = localStorage.getItem(key);

    if (saved) {
      const parsed = JSON.parse(saved) as StudyStreak;
      if (
        typeof parsed.currentStreak === 'number' &&
        typeof parsed.longestStreak === 'number' &&
        Array.isArray(parsed.studyDates)
      ) {
        const today = getToday();
        const yesterday = getYesterday();

        if (
          parsed.lastStudyDate !== today &&
          parsed.lastStudyDate !== yesterday
        ) {
          parsed.currentStreak = 0;
        }

        return parsed;
      }
    }
  } catch {
    // Start fresh if saved data is invalid.
  }

  return {
    currentStreak: 0,
    longestStreak: 0,
    studyDates: [],
    lastStudyDate: null,
  };
}

export function useStudyStreak() {
  const { user, isOnline } = useAppContext();
  const userId = user?.id;

  const [streak, setStreak] = useState<StudyStreak>(() => loadLocalStreak(userId));
  const prevUserIdRef = useRef<string | undefined>(userId);

  // When user switches or logs in/out, re-load that user's cached streak
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId;
      setStreak(loadLocalStreak(userId));
    }
  }, [userId]);

  // Sync with backend when authenticated and online
  useEffect(() => {
    let isCancelled = false;

    async function fetchServerStreak() {
      if (!userId || !isOnline) return;

      try {
        const res = await apiClient<{
          success: boolean;
          currentStreak: number;
          longestStreak: number;
          studyDates: string[];
          lastStudyDate: string | null;
        }>('/api/learner/streak');

        if (!isCancelled && res.success) {
          const updated: StudyStreak = {
            currentStreak: res.currentStreak,
            longestStreak: res.longestStreak,
            studyDates: res.studyDates || [],
            lastStudyDate: res.lastStudyDate,
          };
          setStreak(updated);
          localStorage.setItem(getStorageKey(userId), JSON.stringify(updated));
        }
      } catch (err) {
        // Fall back gracefully to local storage
        console.warn('[useStudyStreak] Server fetch failed, keeping local streak:', err);
      }
    }

    fetchServerStreak();

    return () => {
      isCancelled = true;
    };
  }, [userId, isOnline]);

  const recordStudyActivity = useCallback(async () => {
    const today = getToday();

    setStreak((previous) => {
      if (previous.lastStudyDate === today) {
        return previous;
      }

      const yesterday = getYesterday();
      const continuesStreak = previous.lastStudyDate === yesterday;
      const currentStreak = continuesStreak ? previous.currentStreak + 1 : 1;

      const updated: StudyStreak = {
        currentStreak,
        longestStreak: Math.max(previous.longestStreak, currentStreak),
        studyDates: [...new Set([...previous.studyDates, today])],
        lastStudyDate: today,
      };

      localStorage.setItem(getStorageKey(userId), JSON.stringify(updated));
      return updated;
    });

    // Server-side persistence or offline queue
    if (userId) {
      if (isOnline) {
        try {
          await apiClient('/api/learner/streak/record', {
            method: 'POST',
            body: JSON.stringify({ date: today }),
          });
        } catch (err) {
          console.warn('[useStudyStreak] Server record failed, queueing for sync:', err);
          const clientEventId = `streak_${userId}_${today}`;
          await syncQueue.enqueue(
            userId,
            'STUDY_ACTIVITY',
            { date: today },
            clientEventId
          );
        }
      } else {
        // Queue for background synchronization on reconnection
        const clientEventId = `streak_${userId}_${today}`;
        await syncQueue.enqueue(
          userId,
          'STUDY_ACTIVITY',
          { date: today },
          clientEventId
        );
      }
    }
  }, [userId, isOnline]);

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    studyDates: streak.studyDates,
    recordStudyActivity,
  };
}