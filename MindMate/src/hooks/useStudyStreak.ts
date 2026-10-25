import { useEffect, useState } from 'react';

type StudyStreak = {
  currentStreak: number;
  longestStreak: number;
  studyDates: string[];
  lastStudyDate: string | null;
};

const STORAGE_KEY = 'mindmate-study-streak';

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

function loadStreak(): StudyStreak {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as StudyStreak;
      if (
        typeof parsed.currentStreak === 'number' &&
        typeof parsed.longestStreak === 'number' &&
        Array.isArray(parsed.studyDates)
      ) {
        const today = getToday();
        const yesterday = getYesterday();
        if (parsed.lastStudyDate !== today && parsed.lastStudyDate !== yesterday) {
          parsed.currentStreak = 0;
        }
        return parsed;
      }
    }
  } catch {
    // Start fresh on parsing failure
  }

  return {
    currentStreak: 0,
    longestStreak: 0,
    studyDates: [],
    lastStudyDate: null,
  };
}

export function useStudyStreak() {
  const [streak, setStreak] = useState<StudyStreak>(loadStreak);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(streak));
  }, [streak]);

  function recordStudyActivity() {
    setStreak((previous) => {
      const today = getToday();
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

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    studyDates: streak.studyDates,
    recordStudyActivity,
  };
}
