import { prisma } from '../db.js';
import { DEFAULT_QUESTION_BANK, QuestionData } from './adaptiveEngine.js';

export interface PublicChallengeQuestion {
  questionIndex: number;
  id: string;
  topicId: string;
  topicName: string;
  question: string;
  options: string[];
  difficulty: string;
}

export interface FullChallengeQuestion extends PublicChallengeQuestion {
  correct: number;
  explanation: string;
}

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  badgeIcon: string;
}

export const KNOWN_ACHIEVEMENTS: Record<string, AchievementDef> = {
  FIRST_FRIEND: {
    key: 'FIRST_FRIEND',
    title: 'Social Learner',
    description: 'Connected with your first study partner in MindMate.',
    badgeIcon: 'users',
  },
  FIRST_CHALLENGE: {
    key: 'FIRST_CHALLENGE',
    title: 'Challenger',
    description: 'Initiated your first multiplayer duel.',
    badgeIcon: 'swords',
  },
  CHALLENGE_WINNER: {
    key: 'CHALLENGE_WINNER',
    title: 'Duel Champion',
    description: 'Emerged victorious in a multiplayer quiz battle.',
    badgeIcon: 'trophy',
  },
  SPEED_DEMON: {
    key: 'SPEED_DEMON',
    title: 'Lightning Reflexes',
    description: 'Answered a question correctly in under 3 seconds.',
    badgeIcon: 'zap',
  },
  PERFECT_DUEL: {
    key: 'PERFECT_DUEL',
    title: 'Flawless Victory',
    description: 'Scored 100% correct in a multiplayer challenge.',
    badgeIcon: 'award',
  },
  CENTURION: {
    key: 'CENTURION',
    title: 'Centurion',
    description: 'Scored 500 or more points in a single multiplayer duel.',
    badgeIcon: 'target',
  },
};

/**
 * Checks and unlocks an achievement for a user if not already earned.
 */
export async function checkAndUnlockAchievement(userId: string, achievementKey: string) {
  const def = KNOWN_ACHIEVEMENTS[achievementKey];
  if (!def) return null;

  try {
    const existing = await prisma.userAchievement.findUnique({
      where: {
        userId_achievementKey: {
          userId,
          achievementKey,
        },
      },
    });

    if (existing) return existing;

    const created = await prisma.userAchievement.create({
      data: {
        userId,
        achievementKey,
        title: def.title,
        description: def.description,
        badgeIcon: def.badgeIcon,
      },
    });

    return created;
  } catch (err) {
    console.error(`[Achievements] Error unlocking ${achievementKey} for ${userId}:`, err);
    return null;
  }
}

/**
 * Selects questions for a multiplayer challenge.
 * Uses Prisma adaptiveQuestion table when available, falling back to DEFAULT_QUESTION_BANK.
 */
export async function pickChallengeQuestions(
  topic?: string,
  difficulty?: string,
  count: number = 5
): Promise<FullChallengeQuestion[]> {
  const targetCount = Math.max(3, Math.min(10, count));
  let candidates: Array<{
    id: string;
    topicId: string;
    topicName: string;
    question: string;
    options: string[];
    correct: number;
    explanation: string;
    difficulty: string;
  }> = [];

  try {
    const whereClause: any = {};
    if (topic && topic !== 'all') {
      whereClause.topicId = topic;
    }
    if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty)) {
      whereClause.difficulty = difficulty;
    }

    const dbQuestions = await prisma.adaptiveQuestion.findMany({
      where: whereClause,
      take: 20,
    });

    if (dbQuestions && dbQuestions.length > 0) {
      candidates = dbQuestions.map(q => ({
        id: q.id,
        topicId: q.topicId,
        topicName: q.topicName,
        question: q.question,
        options: JSON.parse(q.optionsJson),
        correct: q.correct,
        explanation: q.explanation,
        difficulty: q.difficulty,
      }));
    }
  } catch (err) {
    console.warn('[Challenge] Failed to fetch questions from DB, using fallback bank:', err);
  }

  // If not enough from DB, augment from DEFAULT_QUESTION_BANK
  if (candidates.length < targetCount) {
    let fallbackPool = DEFAULT_QUESTION_BANK;
    if (topic && topic !== 'all') {
      const filtered = fallbackPool.filter(q => q.topicId === topic);
      if (filtered.length > 0) fallbackPool = filtered;
    }
    if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty)) {
      const filtered = fallbackPool.filter(q => q.difficulty === difficulty);
      if (filtered.length >= targetCount) fallbackPool = filtered;
    }

    let idx = 0;
    for (const q of fallbackPool) {
      if (!candidates.some(c => c.question === q.question)) {
        candidates.push({
          id: `fallback-q-${++idx}`,
          topicId: q.topicId,
          topicName: q.topicName,
          question: q.question,
          options: q.options,
          correct: q.correct,
          explanation: q.explanation,
          difficulty: q.difficulty,
        });
      }
      if (candidates.length >= targetCount) break;
    }

    // If still not enough, augment from all remaining DEFAULT_QUESTION_BANK questions regardless of topic/difficulty
    if (candidates.length < targetCount) {
      for (const q of DEFAULT_QUESTION_BANK) {
        if (!candidates.some(c => c.question === q.question)) {
          candidates.push({
            id: `fallback-q-${++idx}`,
            topicId: q.topicId,
            topicName: q.topicName,
            question: q.question,
            options: q.options,
            correct: q.correct,
            explanation: q.explanation,
            difficulty: q.difficulty,
          });
        }
        if (candidates.length >= targetCount) break;
      }
    }
  }

  // Shuffle and pick targetCount
  const shuffled = [...candidates].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, targetCount);

  return selected.map((q, index) => ({
    questionIndex: index,
    id: q.id,
    topicId: q.topicId,
    topicName: q.topicName,
    question: q.question,
    options: q.options,
    correct: q.correct,
    explanation: q.explanation,
    difficulty: q.difficulty,
  }));
}

/**
 * Creates a new quiz challenge between two users.
 */
export async function createQuizChallenge(
  challengerId: string,
  opponentId: string,
  topic: string = 'data-structures',
  difficulty: string = 'adaptive',
  questionsCount: number = 5
) {
  if (challengerId === opponentId) {
    throw new Error('Cannot challenge yourself to a duel');
  }

  const opponent = await prisma.user.findUnique({
    where: { id: opponentId },
    select: { id: true, name: true },
  });

  if (!opponent) {
    throw new Error('Opponent not found');
  }

  const questions = await pickChallengeQuestions(topic, difficulty, questionsCount);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const challenge = await prisma.quizChallenge.create({
    data: {
      challengerId,
      opponentId,
      topic,
      difficulty,
      status: 'PENDING',
      questionsCount: questions.length,
      questionsJson: JSON.stringify(questions),
      expiresAt,
    },
    include: {
      challenger: { select: { id: true, name: true, role: true } },
      opponent: { select: { id: true, name: true, role: true } },
    },
  });

  // Award FIRST_CHALLENGE achievement
  await checkAndUnlockAchievement(challengerId, 'FIRST_CHALLENGE');

  return challenge;
}

/**
 * Accepts a challenge.
 */
export async function acceptChallenge(userId: string, challengeId: string) {
  const challenge = await prisma.quizChallenge.findUnique({
    where: { id: challengeId },
  });

  if (!challenge) {
    throw new Error('Challenge not found');
  }

  if (challenge.opponentId !== userId) {
    throw new Error('Unauthorized: only the challenged opponent can accept this challenge');
  }

  if (challenge.status !== 'PENDING') {
    throw new Error(`Challenge cannot be accepted in current status (${challenge.status})`);
  }

  if (new Date() > new Date(challenge.expiresAt)) {
    await prisma.quizChallenge.update({
      where: { id: challengeId },
      data: { status: 'EXPIRED' },
    });
    throw new Error('Challenge has expired');
  }

  const updated = await prisma.quizChallenge.update({
    where: { id: challengeId },
    data: { status: 'ACCEPTED' },
    include: {
      challenger: { select: { id: true, name: true, role: true } },
      opponent: { select: { id: true, name: true, role: true } },
    },
  });

  return updated;
}

/**
 * Declines a challenge.
 */
export async function declineChallenge(userId: string, challengeId: string) {
  const challenge = await prisma.quizChallenge.findUnique({
    where: { id: challengeId },
  });

  if (!challenge) {
    throw new Error('Challenge not found');
  }

  if (challenge.opponentId !== userId) {
    throw new Error('Unauthorized: only the challenged opponent can decline');
  }

  const updated = await prisma.quizChallenge.update({
    where: { id: challengeId },
    data: { status: 'DECLINED' },
  });

  return updated;
}

/**
 * Cancels a challenge.
 */
export async function cancelChallenge(userId: string, challengeId: string) {
  const challenge = await prisma.quizChallenge.findUnique({
    where: { id: challengeId },
  });

  if (!challenge) {
    throw new Error('Challenge not found');
  }

  if (challenge.challengerId !== userId) {
    throw new Error('Unauthorized: only the challenger can cancel this challenge');
  }

  if (challenge.status !== 'PENDING') {
    throw new Error('Cannot cancel an already accepted or active challenge');
  }

  const updated = await prisma.quizChallenge.update({
    where: { id: challengeId },
    data: { status: 'CANCELLED' },
  });

  return updated;
}

/**
 * Sanitizes challenge questions for client-side consumption.
 * Strictly strips correct answers and explanations until the challenge is COMPLETED!
 */
export function sanitizeChallengeQuestions(
  fullQuestions: FullChallengeQuestion[],
  isCompleted: boolean
): Array<PublicChallengeQuestion | FullChallengeQuestion> {
  if (isCompleted) {
    return fullQuestions;
  }
  return fullQuestions.map(q => ({
    questionIndex: q.questionIndex,
    id: q.id,
    topicId: q.topicId,
    topicName: q.topicName,
    question: q.question,
    options: q.options,
    difficulty: q.difficulty,
  }));
}

/**
 * Gets details of a challenge, sanitizing questions based on completion status.
 */
export async function getChallengeDetails(userId: string, challengeId: string) {
  const challenge = await prisma.quizChallenge.findUnique({
    where: { id: challengeId },
    include: {
      challenger: { select: { id: true, name: true, role: true } },
      opponent: { select: { id: true, name: true, role: true } },
      submissions: {
        orderBy: { questionIndex: 'asc' },
      },
    },
  });

  if (!challenge) {
    throw new Error('Challenge not found');
  }

  if (challenge.challengerId !== userId && challenge.opponentId !== userId) {
    throw new Error('Unauthorized: you are not a participant in this challenge');
  }

  const isCompleted = challenge.status === 'COMPLETED';
  const fullQuestions: FullChallengeQuestion[] = JSON.parse(challenge.questionsJson);
  const questions = sanitizeChallengeQuestions(fullQuestions, isCompleted);

  // Filter submissions by user if not completed, or return both if completed
  const userSubmissions = challenge.submissions.filter(s => s.userId === userId);
  const opponentUserId = challenge.challengerId === userId ? challenge.opponentId : challenge.challengerId;
  const opponentSubmissions = challenge.submissions.filter(s => s.userId === opponentUserId);

  return {
    id: challenge.id,
    topic: challenge.topic,
    difficulty: challenge.difficulty,
    status: challenge.status,
    questionsCount: challenge.questionsCount,
    challenger: challenge.challenger,
    opponent: challenge.opponent,
    challengerScore: challenge.challengerScore,
    opponentScore: challenge.opponentScore,
    challengerFinishedAt: challenge.challengerFinishedAt,
    opponentFinishedAt: challenge.opponentFinishedAt,
    winnerId: challenge.winnerId,
    isDraw: challenge.isDraw,
    expiresAt: challenge.expiresAt,
    createdAt: challenge.createdAt,
    questions,
    userSubmissions,
    opponentProgress: {
      submittedCount: opponentSubmissions.length,
      isFinished: opponentSubmissions.length >= challenge.questionsCount,
    },
    // Only return opponent submissions with answers if completed
    opponentSubmissions: isCompleted ? opponentSubmissions : undefined,
  };
}

/**
 * Authoritatively processes an answer submission for a challenge question.
 * Correctness, speed bonus, and scores are evaluated strictly server-side.
 */
export async function submitChallengeAnswer(
  userId: string,
  challengeId: string,
  questionIndex: number,
  selectedOption: number,
  timeTakenSeconds: number = 5
) {
  const challenge = await prisma.quizChallenge.findUnique({
    where: { id: challengeId },
  });

  if (!challenge) {
    throw new Error('Challenge not found');
  }

  if (challenge.challengerId !== userId && challenge.opponentId !== userId) {
    throw new Error('Unauthorized: not a participant in this challenge');
  }

  if (challenge.status !== 'ACCEPTED' && challenge.status !== 'IN_PROGRESS') {
    throw new Error(`Challenge is not in progress (current status: ${challenge.status})`);
  }

  if (questionIndex < 0 || questionIndex >= challenge.questionsCount) {
    throw new Error(`Invalid question index ${questionIndex}`);
  }

  // Prevent duplicate submissions
  const existing = await prisma.challengeSubmission.findUnique({
    where: {
      challengeId_userId_questionIndex: {
        challengeId,
        userId,
        questionIndex,
      },
    },
  });

  if (existing) {
    throw new Error(`Question ${questionIndex} has already been answered`);
  }

  // Parse server-side questions with correct answer indices
  const fullQuestions: FullChallengeQuestion[] = JSON.parse(challenge.questionsJson);
  const targetQuestion = fullQuestions.find(q => q.questionIndex === questionIndex);

  if (!targetQuestion) {
    throw new Error(`Question at index ${questionIndex} not found`);
  }

  const isCorrect = (selectedOption === targetQuestion.correct);
  const clampedTime = Math.max(0.1, Math.min(25, timeTakenSeconds));

  // Authoritative Scoring Formula: Correct = 100 points, Speed Bonus = up to 100 points
  let pointsEarned = 0;
  if (isCorrect) {
    const speedBonus = Math.max(0, Math.round((20 - Math.min(20, clampedTime)) * 5));
    pointsEarned = 100 + speedBonus;
  }

  // Unlock Speed Demon achievement if answered correctly in under 3 seconds
  if (isCorrect && clampedTime <= 3.0) {
    await checkAndUnlockAchievement(userId, 'SPEED_DEMON');
  }

  // Save submission
  const submission = await prisma.challengeSubmission.create({
    data: {
      challengeId,
      userId,
      questionIndex,
      selectedOption,
      isCorrect,
      timeTakenSeconds: clampedTime,
      pointsEarned,
    },
  });

  // Calculate updated scores and check completion
  const isChallenger = (userId === challenge.challengerId);
  const newChallengerScore = isChallenger ? challenge.challengerScore + pointsEarned : challenge.challengerScore;
  const newOpponentScore = !isChallenger ? challenge.opponentScore + pointsEarned : challenge.opponentScore;

  // Check how many questions this user has now submitted
  const userSubmissionsCount = await prisma.challengeSubmission.count({
    where: { challengeId, userId },
  });

  const isUserFinished = userSubmissionsCount >= challenge.questionsCount;

  // Check how many questions opponent has submitted
  const opponentId = isChallenger ? challenge.opponentId : challenge.challengerId;
  const opponentSubmissionsCount = await prisma.challengeSubmission.count({
    where: { challengeId, userId: opponentId },
  });
  const isOpponentFinished = opponentSubmissionsCount >= challenge.questionsCount;

  const now = new Date();
  const updateData: any = {
    status: 'IN_PROGRESS',
    challengerScore: newChallengerScore,
    opponentScore: newOpponentScore,
  };

  if (isChallenger && isUserFinished && !challenge.challengerFinishedAt) {
    updateData.challengerFinishedAt = now;
  } else if (!isChallenger && isUserFinished && !challenge.opponentFinishedAt) {
    updateData.opponentFinishedAt = now;
  }

  let isGameOver = false;
  let winnerId: string | null = null;
  let isDraw = false;

  // If both players have finished all questions, conclude the challenge
  if (isUserFinished && isOpponentFinished) {
    isGameOver = true;
    updateData.status = 'COMPLETED';

    if (newChallengerScore > newOpponentScore) {
      winnerId = challenge.challengerId;
      updateData.winnerId = challenge.challengerId;
      updateData.isDraw = false;
    } else if (newOpponentScore > newChallengerScore) {
      winnerId = challenge.opponentId;
      updateData.winnerId = challenge.opponentId;
      updateData.isDraw = false;
    } else {
      isDraw = true;
      updateData.isDraw = true;
      updateData.winnerId = null;
    }
  }

  const updatedChallenge = await prisma.quizChallenge.update({
    where: { id: challengeId },
    data: updateData,
  });

  // Award end-of-game achievements if completed
  if (isGameOver && winnerId) {
    await checkAndUnlockAchievement(winnerId, 'CHALLENGE_WINNER');
    const winningScore = winnerId === challenge.challengerId ? newChallengerScore : newOpponentScore;
    if (winningScore >= 500) {
      await checkAndUnlockAchievement(winnerId, 'CENTURION');
    }

    // Check if winner got 100% correct
    const winnerSubmissions = await prisma.challengeSubmission.findMany({
      where: { challengeId, userId: winnerId },
    });
    if (winnerSubmissions.every(s => s.isCorrect)) {
      await checkAndUnlockAchievement(winnerId, 'PERFECT_DUEL');
    }
  }

  return {
    submissionId: submission.id,
    questionIndex,
    isCorrect,
    correctOption: isGameOver ? targetQuestion.correct : undefined,
    explanation: isGameOver ? targetQuestion.explanation : undefined,
    pointsEarned,
    timeTakenSeconds: clampedTime,
    challengerScore: newChallengerScore,
    opponentScore: newOpponentScore,
    isUserFinished,
    isOpponentFinished,
    isGameOver,
    winnerId,
    isDraw,
    challengeStatus: updatedChallenge.status,
  };
}

/**
 * Lists challenges for a user partitioned into active and completed.
 */
export async function listUserChallenges(userId: string) {
  const challenges = await prisma.quizChallenge.findMany({
    where: {
      OR: [
        { challengerId: userId },
        { opponentId: userId },
      ],
    },
    include: {
      challenger: { select: { id: true, name: true, role: true } },
      opponent: { select: { id: true, name: true, role: true } },
      submissions: {
        where: { userId },
        select: { id: true, questionIndex: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const active = [];
  const completed = [];

  for (const c of challenges) {
    const isChallenger = (c.challengerId === userId);
    const opponent = isChallenger ? c.opponent : c.challenger;
    const userScore = isChallenger ? c.challengerScore : c.opponentScore;
    const opponentScore = isChallenger ? c.opponentScore : c.challengerScore;
    const userFinished = isChallenger ? !!c.challengerFinishedAt : !!c.opponentFinishedAt;
    const answeredCount = c.submissions.length;

    let resultStatus: 'WIN' | 'LOSS' | 'DRAW' | 'PENDING' | 'IN_PROGRESS' | 'DECLINED' | 'CANCELLED' | 'EXPIRED' = 'PENDING';
    if (c.status === 'COMPLETED') {
      if (c.isDraw) resultStatus = 'DRAW';
      else if (c.winnerId === userId) resultStatus = 'WIN';
      else resultStatus = 'LOSS';
    } else if (c.status === 'IN_PROGRESS' || c.status === 'ACCEPTED') {
      resultStatus = 'IN_PROGRESS';
    } else {
      resultStatus = c.status as any;
    }

    const item = {
      id: c.id,
      topic: c.topic,
      difficulty: c.difficulty,
      status: c.status,
      resultStatus,
      isChallenger,
      opponent: {
        id: opponent.id,
        name: opponent.name,
        role: opponent.role,
      },
      userScore,
      opponentScore,
      questionsCount: c.questionsCount,
      answeredCount,
      userFinished,
      expiresAt: c.expiresAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
    };

    if (['PENDING', 'ACCEPTED', 'IN_PROGRESS'].includes(c.status)) {
      active.push(item);
    } else {
      completed.push(item);
    }
  }

  return { active, completed };
}

/**
 * Computes authentic leaderboard statistics based on real QuizChallenge and QuizAttempt data.
 */
export async function getLeaderboard(currentUserId: string) {
  // Get all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      role: true,
      goal: true,
      createdChallenges: {
        where: { status: 'COMPLETED' },
        select: { challengerScore: true, winnerId: true, isDraw: true },
      },
      receivedChallenges: {
        where: { status: 'COMPLETED' },
        select: { opponentScore: true, winnerId: true, isDraw: true },
      },
      quizAttempts: {
        select: { score: true, correctAnswers: true, totalQuestions: true },
      },
      achievements: {
        select: { achievementKey: true },
      },
    },
  });

  // Also get current user's friends to compute friends leaderboard
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ requesterId: currentUserId }, { addresseeId: currentUserId }],
    },
  });
  const friendIds = new Set<string>([currentUserId]);
  for (const f of friendships) {
    friendIds.add(f.requesterId === currentUserId ? f.addresseeId : f.requesterId);
  }

  const entries = users.map(u => {
    let challengesPlayed = 0;
    let challengesWon = 0;
    let totalChallengeScore = 0;

    for (const c of u.createdChallenges) {
      challengesPlayed++;
      totalChallengeScore += c.challengerScore;
      if (c.winnerId === u.id) challengesWon++;
    }

    for (const c of u.receivedChallenges) {
      challengesPlayed++;
      totalChallengeScore += c.opponentScore;
      if (c.winnerId === u.id) challengesWon++;
    }

    const winRate = challengesPlayed > 0 ? Math.round((challengesWon / challengesPlayed) * 100) : 0;
    const totalQuizzes = u.quizAttempts.length;
    const avgQuizScore = totalQuizzes > 0
      ? Math.round(u.quizAttempts.reduce((acc, q) => acc + q.score, 0) / totalQuizzes)
      : 0;

    // Composite ranking score: challenge score + quiz points + achievements bonus
    const compositeScore = totalChallengeScore + (avgQuizScore * 5) + (u.achievements.length * 50);

    return {
      userId: u.id,
      name: u.name,
      role: u.role,
      goal: u.goal,
      challengesPlayed,
      challengesWon,
      winRate,
      totalChallengeScore,
      totalQuizzes,
      avgQuizScore,
      achievementsCount: u.achievements.length,
      compositeScore,
      isCurrentUser: (u.id === currentUserId),
      isFriend: friendIds.has(u.id),
    };
  });

  // Sort descending by compositeScore, then challengesWon
  entries.sort((a, b) => b.compositeScore - a.compositeScore || b.challengesWon - a.challengesWon);

  const globalLeaderboard = entries.map((entry, idx) => ({
    rank: idx + 1,
    ...entry,
  }));

  const friendsEntries = entries.filter(e => e.isFriend);
  friendsEntries.sort((a, b) => b.compositeScore - a.compositeScore || b.challengesWon - a.challengesWon);
  const friendsLeaderboard = friendsEntries.map((entry, idx) => ({
    rank: idx + 1,
    ...entry,
  }));

  const currentUserEntry = globalLeaderboard.find(e => e.userId === currentUserId);

  return {
    currentUserRank: currentUserEntry?.rank || 1,
    globalLeaderboard: globalLeaderboard.slice(0, 25),
    friendsLeaderboard: friendsLeaderboard.slice(0, 25),
  };
}

/**
 * Returns all user achievements with unlocked status.
 */
export async function getUserAchievements(userId: string) {
  const unlocked = await prisma.userAchievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: 'desc' },
  });

  const unlockedMap = new Map(unlocked.map(a => [a.achievementKey, a]));

  const allAchievements = Object.values(KNOWN_ACHIEVEMENTS).map(def => {
    const userAch = unlockedMap.get(def.key);
    return {
      key: def.key,
      title: def.title,
      description: def.description,
      badgeIcon: def.badgeIcon,
      isUnlocked: !!userAch,
      unlockedAt: userAch?.unlockedAt?.toISOString() || null,
    };
  });

  return {
    achievements: allAchievements,
    totalUnlocked: unlocked.length,
    totalAvailable: Object.keys(KNOWN_ACHIEVEMENTS).length,
  };
}
