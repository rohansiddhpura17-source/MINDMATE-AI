import { prisma } from '../db.js';

export interface UserStreakResult {
  currentStreak: number;
  longestStreak: number;
  studyDates: string[];
  lastStudyDate: string | null;
}

/**
 * Format date to YYYY-MM-DD string
 */
export function formatDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format local date to YYYY-MM-DD string
 */
export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Given a list of YYYY-MM-DD date strings and a reference Date, calculate current and longest streak
 */
export function calculateStreakFromDates(
  dates: string[],
  referenceDate: Date = new Date()
): { currentStreak: number; longestStreak: number; lastStudyDate: string | null } {
  if (!dates || dates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastStudyDate: null };
  }

  // Deduplicate and sort dates ascending
  const uniqueDates = Array.from(new Set(dates)).sort();
  const lastStudyDate = uniqueDates[uniqueDates.length - 1];

  // Helper to parse YYYY-MM-DD to UTC midnight timestamp in days
  const toDayNumber = (dStr: string): number => {
    const [y, m, d] = dStr.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24));
  };

  const dayNumbers = uniqueDates.map(toDayNumber).sort((a, b) => a - b);

  // Calculate longest streak
  let longestStreak = 0;
  let running = 0;
  for (let i = 0; i < dayNumbers.length; i++) {
    if (i === 0 || dayNumbers[i] === dayNumbers[i - 1] + 1) {
      running += 1;
    } else if (dayNumbers[i] === dayNumbers[i - 1]) {
      // duplicate day, ignore
    } else {
      running = 1;
    }
    if (running > longestStreak) {
      longestStreak = running;
    }
  }

  // Calculate current streak relative to referenceDate
  // Reference date keys in local format
  const todayKey = formatLocalDateKey(referenceDate);
  const refDateObj = new Date(referenceDate);
  refDateObj.setDate(refDateObj.getDate() - 1);
  const yesterdayKey = formatLocalDateKey(refDateObj);

  const todayNum = toDayNumber(todayKey);
  const yesterdayNum = toDayNumber(yesterdayKey);

  const daySet = new Set(dayNumbers);
  let currentStreak = 0;

  if (daySet.has(todayNum)) {
    // Streak includes today
    let checkDay = todayNum;
    while (daySet.has(checkDay)) {
      currentStreak += 1;
      checkDay -= 1;
    }
  } else if (daySet.has(yesterdayNum)) {
    // Streak active through yesterday (learner hasn't practiced yet today)
    let checkDay = yesterdayNum;
    while (daySet.has(checkDay)) {
      currentStreak += 1;
      checkDay -= 1;
    }
  } else {
    // Neither today nor yesterday had study activity
    currentStreak = 0;
  }

  return { currentStreak, longestStreak, lastStudyDate };
}

/**
 * Retrieve the authentic study streak for an authenticated learner
 */
export async function getUserStudyStreak(
  userId: string,
  referenceDate: Date = new Date()
): Promise<UserStreakResult> {
  const [quizAttempts, completedTasks, studySyncEvents] = await Promise.all([
    prisma.quizAttempt.findMany({
      where: { userId },
      select: { createdAt: true },
    }),
    prisma.studyTask.findMany({
      where: { userId, isCompleted: true },
      select: { date: true, completedAt: true },
    }),
    prisma.syncEvent.findMany({
      where: { userId, eventType: 'STUDY_ACTIVITY' },
      select: { syncedAt: true, payloadJson: true },
    }),
  ]);

  const dateSet = new Set<string>();

  // Add quiz attempt dates
  for (const q of quizAttempts) {
    dateSet.add(formatLocalDateKey(q.createdAt));
  }

  // Add completed study task dates
  for (const t of completedTasks) {
    if (t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
      dateSet.add(t.date);
    } else if (t.completedAt) {
      dateSet.add(formatLocalDateKey(t.completedAt));
    }
  }

  // Add recorded study sync events
  for (const s of studySyncEvents) {
    try {
      const payload = JSON.parse(s.payloadJson);
      if (payload.date && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
        dateSet.add(payload.date);
      } else {
        dateSet.add(formatLocalDateKey(s.syncedAt));
      }
    } catch {
      dateSet.add(formatLocalDateKey(s.syncedAt));
    }
  }

  const studyDates = Array.from(dateSet).sort();
  const { currentStreak, longestStreak, lastStudyDate } = calculateStreakFromDates(
    studyDates,
    referenceDate
  );

  return {
    currentStreak,
    longestStreak,
    studyDates,
    lastStudyDate,
  };
}

/**
 * Record a study session for an authenticated learner on a given date (idempotent)
 */
export async function recordUserStudyActivity(
  userId: string,
  targetDate?: string,
  referenceDate: Date = new Date()
): Promise<UserStreakResult> {
  const dateStr = targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)
    ? targetDate
    : formatLocalDateKey(referenceDate);

  const clientEventId = `streak_${userId}_${dateStr}`;

  // Idempotently record in sync_events table
  const existing = await prisma.syncEvent.findUnique({
    where: { clientEventId },
  });

  if (!existing) {
    await prisma.syncEvent.create({
      data: {
        userId,
        clientEventId,
        eventType: 'STUDY_ACTIVITY',
        payloadJson: JSON.stringify({ date: dateStr }),
        status: 'SYNCED',
        syncedAt: new Date(),
      },
    });
  }

  return await getUserStudyStreak(userId, referenceDate);
}
