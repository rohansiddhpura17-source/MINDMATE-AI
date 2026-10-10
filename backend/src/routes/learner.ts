import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  validatePdfSignature,
  extractTextFromPdf,
  chunkExtractedPages,
  saveUploadedDocument,
  deleteDocumentFile,
  MAX_FILE_SIZE_BYTES,
} from '../services/documentProcessor.js';
import {
  generateDocumentSummary,
  generateKeyConcepts,
  generateFlashcards,
  generateDocumentQuiz,
  answerDocumentQuery,
} from '../services/documentAi.js';
import {
  selectNextAdaptiveQuestion,
  processAdaptiveAnswer,
  seedQuestionsIfEmpty,
} from '../services/adaptiveEngine.js';
import {
  classifyConfidence,
  getMasteryStatus,
  DifficultyLevel,
} from '../services/masteryModel.js';
import {
  calculateNextReview,
  recordTopicReview,
  getUserSpacedReviews,
  syncSpacedRepetitionFromAttempt,
  scoreToReviewOutcome,
  ReviewOutcome,
} from '../services/spacedRepetition.js';
import {
  generateStudySchedule,
  completeStudyTask,
  rescheduleStudyTask,
  computeTopicPriorities,
  generateBaselineSchedule,
} from '../services/studyPlanner.js';
import { buildLearnerTwinProfile } from '../services/learningTwin.js';
import { generateLearnerInsights, scheduleInsightAsTask } from '../services/learningInsights.js';
import { synthesizeTwinProfile } from '../services/twinAiSynthesis.js';
import { getUserStudyStreak, recordUserStudyActivity } from '../services/streakService.js';

export const learnerRouter = Router();

// Enforce authentication on all learner endpoints
learnerRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
});

const handleUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File size exceeds maximum limit of 15MB.' });
        return;
      }
      res.status(400).json({ error: `Upload error: ${err.message}` });
      return;
    }
    next();
  });
};

/* -------------------------------------------------------------------------- */
/*                                Preferences                                 */
/* -------------------------------------------------------------------------- */

const UpdatePreferencesSchema = z.object({
  adaptiveDifficulty: z.boolean().optional(),
  personalizedRecs: z.boolean().optional(),
  proactiveAI: z.boolean().optional(),
  learningInsights: z.boolean().optional(),
  cloudAI: z.boolean().optional(),
  learningStyle: z.string().optional(),
  dailyGoalMinutes: z.number().int().positive().optional(),
});

learnerRouter.get('/preferences', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    let preferences = await prisma.userPreference.findUnique({
      where: { userId },
    });

    if (!preferences) {
      preferences = await prisma.userPreference.create({
        data: { userId },
      });
    }

    res.json({ success: true, preferences });
  } catch (error) {
    console.error('[Get Preferences Error]', error);
    res.status(500).json({ error: 'Failed to retrieve preferences' });
  }
});

learnerRouter.put('/preferences', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = UpdatePreferencesSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten().fieldErrors });
      return;
    }

    const userId = req.user!.id;
    const preferences = await prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...parseResult.data,
      },
      update: parseResult.data,
    });

    res.json({ success: true, preferences });
  } catch (error) {
    console.error('[Update Preferences Error]', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/* -------------------------------------------------------------------------- */
/*                              Learner Progress                              */
/* -------------------------------------------------------------------------- */

const UpdateProgressSchema = z.object({
  topicId: z.string().min(1),
  topicName: z.string().min(1),
  masteryScore: z.number().min(0).max(100),
  streakDays: z.number().int().min(0).optional(),
  attemptDelta: z.number().int().min(0).optional(),
  correctDelta: z.number().int().min(0).optional(),
});

learnerRouter.get('/progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const progressList = await prisma.learnerProgress.findMany({
      where: { userId },
      orderBy: { topicName: 'asc' },
    });

    // Compute overall statistics
    const totalMastery = progressList.reduce((acc, p) => acc + p.masteryScore, 0);
    const overallMastery = progressList.length > 0 ? Math.round(totalMastery / progressList.length) : 0;
    const maxStreak = progressList.reduce((acc, p) => Math.max(acc, p.streakDays), 0);

    res.json({
      success: true,
      overallMastery,
      maxStreak,
      topics: progressList.map((p) => {
        const conf = classifyConfidence(p.attemptCount);
        const st = getMasteryStatus(Math.round(p.masteryScore), p.confidenceLevel as any);
        return {
          id: p.id,
          topicId: p.topicId,
          name: p.topicName,
          mastery: Math.round(p.masteryScore),
          streak: p.streakDays,
          attemptCount: p.attemptCount,
          correctCount: p.correctCount,
          confidenceLevel: p.confidenceLevel,
          confidenceScore: conf.score,
          confidenceDescription: conf.description,
          currentDifficulty: p.currentDifficulty,
          consecutiveCorrect: p.consecutiveCorrect,
          consecutiveIncorrect: p.consecutiveIncorrect,
          status: st,
          lastPracticed: p.lastPracticed,
        };
      }),
    });
  } catch (error) {
    console.error('[Get Progress Error]', error);
    res.status(500).json({ error: 'Failed to retrieve progress' });
  }
});

/**
 * GET /api/learner/streak
 * Retrieve the authentic study streak for the authenticated learner
 */
learnerRouter.get('/streak', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const streak = await getUserStudyStreak(userId);
    res.json({ success: true, ...streak });
  } catch (error: any) {
    console.error('[Get Study Streak Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to retrieve study streak' });
  }
});

/**
 * POST /api/learner/streak/record
 * Idempotently record a study activity for today (or specified date)
 */
learnerRouter.post('/streak/record', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { date } = req.body || {};
    const streak = await recordUserStudyActivity(userId, date);
    res.json({ success: true, ...streak });
  } catch (error: any) {
    console.error('[Record Study Activity Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to record study activity' });
  }
});

learnerRouter.post('/progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = UpdateProgressSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten().fieldErrors });
      return;
    }

    const userId = req.user!.id;
    const { topicId, topicName, masteryScore, streakDays, attemptDelta, correctDelta } = parseResult.data;

    const existing = await prisma.learnerProgress.findUnique({
      where: {
        userId_topicId: { userId, topicId },
      },
    });

    const updated = await prisma.learnerProgress.upsert({
      where: {
        userId_topicId: { userId, topicId },
      },
      create: {
        userId,
        topicId,
        topicName,
        masteryScore,
        streakDays: streakDays ?? 1,
        attemptCount: attemptDelta ?? 1,
        correctCount: correctDelta ?? 1,
        lastPracticed: new Date(),
      },
      update: {
        topicName,
        masteryScore,
        streakDays: streakDays !== undefined ? streakDays : (existing?.streakDays ?? 0) + 1,
        attemptCount: (existing?.attemptCount ?? 0) + (attemptDelta ?? 1),
        correctCount: (existing?.correctCount ?? 0) + (correctDelta ?? 1),
        lastPracticed: new Date(),
      },
    });

    res.json({ success: true, progress: updated });
  } catch (error) {
    console.error('[Update Progress Error]', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

/* -------------------------------------------------------------------------- */
/*                                Quiz Attempts                               */
/* -------------------------------------------------------------------------- */

const QuizAttemptSchema = z.object({
  topicId: z.string().min(1),
  topicName: z.string().min(1),
  score: z.number().min(0),
  totalQuestions: z.number().int().positive(),
  correctAnswers: z.number().int().min(0),
  answers: z.array(z.any()).optional(),
  clientEventId: z.string().optional(),
});

learnerRouter.get('/quizzes', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const quizzes = await prisma.quizAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      quizzes: quizzes.map((q) => ({
        id: q.id,
        clientEventId: q.clientEventId,
        topicId: q.topicId,
        topicName: q.topicName,
        score: q.score,
        totalQuestions: q.totalQuestions,
        correctAnswers: q.correctAnswers,
        createdAt: q.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Get Quizzes Error]', error);
    res.status(500).json({ error: 'Failed to retrieve quiz history' });
  }
});

learnerRouter.post('/quizzes', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = QuizAttemptSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten().fieldErrors });
      return;
    }

    const userId = req.user!.id;
    const { topicId, topicName, score, totalQuestions, correctAnswers, answers, clientEventId } = parseResult.data;

    // Idempotency check: if clientEventId was already recorded, return existing attempt
    if (clientEventId) {
      const existingAttempt = await prisma.quizAttempt.findUnique({
        where: { clientEventId },
      });
      if (existingAttempt) {
        res.status(200).json({
          success: true,
          quizAttempt: existingAttempt,
          isDuplicate: true,
          message: 'Quiz attempt already synchronized (idempotent)',
        });
        return;
      }
    }

    // Persist quiz attempt
    const attempt = await prisma.quizAttempt.create({
      data: {
        userId,
        clientEventId: clientEventId || null,
        topicId,
        topicName,
        score,
        totalQuestions,
        correctAnswers,
        answersJson: JSON.stringify(answers || []),
      },
    });

    // Automatically update topic mastery
    const percentageScore = (correctAnswers / totalQuestions) * 100;
    const existing = await prisma.learnerProgress.findUnique({
      where: { userId_topicId: { userId, topicId } },
    });

    // Exponential moving average for mastery: 70% previous + 30% new
    const newMastery = existing
      ? Math.round(existing.masteryScore * 0.7 + percentageScore * 0.3)
      : Math.round(percentageScore);

    const updatedProgress = await prisma.learnerProgress.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: {
        userId,
        topicId,
        topicName,
        masteryScore: percentageScore,
        streakDays: percentageScore >= 60 ? 1 : 0,
        attemptCount: totalQuestions,
        correctCount: correctAnswers,
        lastPracticed: new Date(),
      },
      update: {
        masteryScore: newMastery,
        streakDays: percentageScore >= 60 ? (existing?.streakDays ?? 0) + 1 : (existing?.streakDays ?? 0),
        attemptCount: (existing?.attemptCount ?? 0) + totalQuestions,
        correctCount: (existing?.correctCount ?? 0) + correctAnswers,
        lastPracticed: new Date(),
      },
    });

    // Automatically sync spaced repetition schedule
    await syncSpacedRepetitionFromAttempt(userId, topicId, topicName, percentageScore).catch((err) =>
      console.warn('[Spaced Repetition Sync Error]', err)
    );

    res.status(201).json({
      success: true,
      quizAttempt: attempt,
      updatedProgress,
    });
  } catch (error) {
    console.error('[Create Quiz Attempt Error]', error);
    res.status(500).json({ error: 'Failed to record quiz attempt' });
  }
});

/* -------------------------------------------------------------------------- */
/*                          Adaptive Learning Engine                          */
/* -------------------------------------------------------------------------- */

const AdaptiveAnswerSchema = z.object({
  questionId: z.string().min(1, 'questionId is required'),
  selectedOption: z.number().int().min(0, 'selectedOption must be non-negative'),
  clientEventId: z.string().optional(),
  sessionExcludedIds: z.array(z.string()).optional(),
});

/**
 * Fetch the next adaptive question personalized to learner mastery and difficulty
 */
learnerRouter.get('/adaptive/next', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const topicId = typeof req.query.topicId === 'string' && req.query.topicId.trim() ? req.query.topicId.trim() : undefined;
    const preferredDifficulty = (['easy', 'medium', 'hard'].includes(req.query.difficulty as string))
      ? (req.query.difficulty as DifficultyLevel)
      : undefined;

    const excludeStr = typeof req.query.exclude === 'string' ? req.query.exclude : '';
    const excludeQuestionIds = excludeStr ? excludeStr.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const result = await selectNextAdaptiveQuestion(userId, {
      topicId,
      preferredDifficulty,
      excludeQuestionIds,
    });

    res.json({
      success: true,
      question: result.question,
      selectionReason: result.selectionReason,
      targetDifficulty: result.targetDifficulty,
      topicId: result.topicId,
      topicName: result.topicName,
    });
  } catch (error: any) {
    console.error('[Adaptive Next Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to select next adaptive question' });
  }
});

/**
 * Submit an answer in the adaptive learning loop, evaluate Bayesian mastery, and select next question
 */
learnerRouter.post('/adaptive/answer', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = AdaptiveAnswerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten().fieldErrors });
      return;
    }

    const userId = req.user!.id;
    const result = await processAdaptiveAnswer(userId, parseResult.data);

    // Automatically sync spaced repetition schedule from updated adaptive performance
    await syncSpacedRepetitionFromAttempt(
      userId,
      result.topicId,
      result.topicName,
      result.masteryAfter
    ).catch((err) => console.warn('[Spaced Repetition Sync Error]', err));

    res.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('[Adaptive Answer Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to process adaptive answer' });
  }
});

/**
 * Diagnostic summary of learner's knowledge state across topics with evidence indicators
 */
learnerRouter.get('/adaptive/diagnostic', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    await seedQuestionsIfEmpty();

    const allProgress = await prisma.learnerProgress.findMany({
      where: { userId },
      orderBy: { topicName: 'asc' },
    });

    const diagnostics = allProgress.map((p) => {
      const conf = classifyConfidence(p.attemptCount);
      const status = getMasteryStatus(Math.round(p.masteryScore), p.confidenceLevel as any);
      return {
        topicId: p.topicId,
        topicName: p.topicName,
        masteryScore: Math.round(p.masteryScore),
        attemptCount: p.attemptCount,
        correctCount: p.correctCount,
        confidenceLevel: p.confidenceLevel,
        confidenceScore: conf.score,
        confidenceDescription: conf.description,
        currentDifficulty: p.currentDifficulty,
        consecutiveCorrect: p.consecutiveCorrect,
        consecutiveIncorrect: p.consecutiveIncorrect,
        status,
        lastPracticed: p.lastPracticed,
      };
    });

    // Recommend topics needing practice or calibration
    const recommendations = diagnostics
      .filter((d) => d.status === 'NEEDS_PRACTICE' || d.status === 'CALIBRATING' || d.status === 'DEVELOPING')
      .sort((a, b) => a.masteryScore - b.masteryScore);

    res.json({
      success: true,
      totalTopicsTracked: diagnostics.length,
      topics: diagnostics,
      recommendedTopics: recommendations.slice(0, 3),
    });
  } catch (error) {
    console.error('[Adaptive Diagnostic Error]', error);
    res.status(500).json({ error: 'Failed to retrieve adaptive diagnostic' });
  }
});

/**
 * Seed questions endpoint
 */
learnerRouter.post('/adaptive/seed', async (_req: Request, res: Response): Promise<void> => {
  try {
    const count = await seedQuestionsIfEmpty();
    res.json({ success: true, totalQuestions: count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to seed questions' });
  }
});

/* -------------------------------------------------------------------------- */
/*                  Study Planner & Spaced Repetition                         */
/* -------------------------------------------------------------------------- */

const PlannerSettingsSchema = z.object({
  dailyGoalMinutes: z.number().int().min(5).max(360).optional(),
  preferredSessionMinutes: z.number().int().min(5).max(120).optional(),
  targetDays: z.array(z.string()).optional(),
  targetGoalDate: z.string().nullable().optional(),
  targetGoalName: z.string().nullable().optional(),
  priorityTopics: z.array(z.string()).optional(),
  reviewStrategy: z.enum(['BALANCED', 'REVIEWS_FIRST', 'KNOWLEDGE_GAP_FIRST']).optional(),
});

const CompleteTaskSchema = z.object({
  isCompleted: z.boolean().optional(),
  scorePercentage: z.number().min(0).max(100).optional(),
});

const RescheduleTaskSchema = z.object({
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'newDate must be formatted as YYYY-MM-DD'),
});

const SpacedReviewRecordSchema = z.object({
  topicId: z.string().min(1),
  topicName: z.string().min(1),
  outcome: z.enum(['PERFECT', 'PASS', 'PARTIAL', 'FAIL', 'CRITICAL_FAIL']),
});

/**
 * Fetch learner study plan (auto-generates initial plan if none exists)
 */
learnerRouter.get('/planner', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const plan = await generateStudySchedule(userId, { preserveCompletedHistory: true });
    res.json(plan);
  } catch (error: any) {
    console.error('[Get Study Plan Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to retrieve study plan' });
  }
});

/**
 * Explicitly trigger study plan generation / replanning
 */
learnerRouter.post('/planner/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const plan = await generateStudySchedule(userId, { preserveCompletedHistory: true });
    res.json(plan);
  } catch (error: any) {
    console.error('[Generate Study Plan Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to generate study plan' });
  }
});

/**
 * Update planner settings and re-generate future schedule
 */
learnerRouter.put('/planner/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const parseResult = PlannerSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten().fieldErrors });
      return;
    }

    const {
      dailyGoalMinutes,
      preferredSessionMinutes,
      targetDays,
      targetGoalDate,
      targetGoalName,
      priorityTopics,
      reviewStrategy,
    } = parseResult.data;

    const updateData: any = {};
    if (dailyGoalMinutes !== undefined) updateData.dailyGoalMinutes = dailyGoalMinutes;
    if (preferredSessionMinutes !== undefined) updateData.preferredSessionMinutes = preferredSessionMinutes;
    if (targetDays !== undefined) updateData.targetDaysJson = JSON.stringify(targetDays);
    if (targetGoalDate !== undefined) {
      updateData.targetGoalDate = targetGoalDate ? new Date(targetGoalDate) : null;
    }
    if (targetGoalName !== undefined) updateData.targetGoalName = targetGoalName;
    if (priorityTopics !== undefined) updateData.priorityTopicsJson = JSON.stringify(priorityTopics);
    if (reviewStrategy !== undefined) updateData.reviewStrategy = reviewStrategy;

    await prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...updateData,
      },
      update: updateData,
    });

    // Re-generate schedule with updated settings preserving history
    const plan = await generateStudySchedule(userId, { preserveCompletedHistory: true });
    res.json(plan);
  } catch (error: any) {
    console.error('[Update Planner Settings Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to update planner settings' });
  }
});

/**
 * Mark a scheduled study task complete
 */
learnerRouter.post('/planner/tasks/:id/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const parseResult = CompleteTaskSchema.safeParse(req.body);
    const scorePercentage = parseResult.success ? parseResult.data.scorePercentage : undefined;
    const isCompleted = parseResult.success && parseResult.data.isCompleted !== undefined ? parseResult.data.isCompleted : true;

    const result = await completeStudyTask(userId, id, { scorePercentage, isCompleted });
    res.json(result);
  } catch (error: any) {
    console.error('[Complete Study Task Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to complete study task' });
  }
});

/**
 * Reschedule or postpone a study task to another date
 */
learnerRouter.post('/planner/tasks/:id/reschedule', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const parseResult = RescheduleTaskSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten().fieldErrors });
      return;
    }

    const result = await rescheduleStudyTask(userId, id, parseResult.data.newDate);
    res.json(result);
  } catch (error: any) {
    console.error('[Reschedule Study Task Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to reschedule study task' });
  }
});

/**
 * Get all spaced repetition items and due statuses for user
 */
learnerRouter.get('/spaced-repetition', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const reviews = await getUserSpacedReviews(userId);
    res.json({
      success: true,
      totalTracked: reviews.length,
      overdueCount: reviews.filter((r) => r.isOverdue).length,
      reviews,
    });
  } catch (error: any) {
    console.error('[Get Spaced Repetition Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to retrieve spaced repetition reviews' });
  }
});

/**
 * Directly record an outcome for spaced repetition review
 */
learnerRouter.post('/spaced-repetition/review', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const parseResult = SpacedReviewRecordSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten().fieldErrors });
      return;
    }

    const { topicId, topicName, outcome } = parseResult.data;
    const result = await recordTopicReview(userId, topicId, topicName, outcome);

    res.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('[Record Spaced Review Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to record spaced review' });
  }
});

/**
 * Baseline comparison: Explainable Adaptive Planner vs Naive Static Baseline
 */
learnerRouter.get('/planner/baseline-comparison', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const [adaptivePlan, baselinePlan] = await Promise.all([
      generateStudySchedule(userId, { preserveCompletedHistory: true }),
      generateBaselineSchedule(userId),
    ]);

    const adaptiveUniqueTopics = new Set(
      adaptivePlan.days.flatMap((d) => d.tasks.map((t) => t.topicId))
    ).size;
    const baselineUniqueTopics = new Set(baselinePlan.assignedTopicIds).size;

    const overdueProtected = adaptivePlan.metrics.overdueReviewsCount;

    res.json({
      success: true,
      comparison: {
        adaptiveScheduler: {
          strategy: 'EXPLAINABLE_BALANCED_SPACED_REPETITION',
          weeklyPlannedMinutes: adaptivePlan.metrics.weeklyPlannedMinutes,
          uniqueTopicsCovered: adaptiveUniqueTopics,
          spacedRepetitionReviewsIncluded: adaptivePlan.days.flatMap((d) => d.tasks).filter((t) => t.type === 'REVIEW').length,
          overdueReviewsHandled: overdueProtected,
          hasInterleaving: true,
          providesExplainableRationals: true,
        },
        naiveBaseline: {
          strategy: baselinePlan.strategy,
          weeklyPlannedMinutes: baselinePlan.assignedTopicIds.length * 15,
          uniqueTopicsCovered: baselineUniqueTopics,
          spacedRepetitionReviewsIncluded: 0,
          overdueReviewsHandled: 0,
          hasInterleaving: false,
          providesExplainableRationals: false,
        },
        documentedBenefits: [
          'Prevents forgetting curve decay by prioritizing due spaced repetition reviews',
          'Interleaves multiple topics instead of causing cognitive fatigue on a single subject',
          'Paces daily study volume strictly within learner dailyGoalMinutes constraint',
          'Provides pedagogical rationale for every recommended activity',
        ],
      },
    });
  } catch (error: any) {
    console.error('[Baseline Comparison Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to compute baseline comparison' });
  }
});

/* -------------------------------------------------------------------------- */
/*                         Learning Materials & Documents                     */
/* -------------------------------------------------------------------------- */

const MaterialMetadataSchema = z.object({
  name: z.string().min(1, 'Material name required').trim(),
  type: z.string().default('PDF'),
  pages: z.number().int().positive().default(1),
  status: z.string().default('processed'),
});

const DocumentQuerySchema = z.object({
  question: z.string().min(1, 'Question must not be empty').max(1000).trim(),
});

const DocumentQuizSchema = z.object({
  count: z.number().int().min(1).max(10).optional().default(4),
});

/**
 * List all learning materials for the authenticated user
 */
learnerRouter.get('/materials', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const materials = await prisma.learningMaterial.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });

    res.json({
      success: true,
      materials: materials.map((m) => {
        let summary: any = null;
        let conceptsCount = 0;
        let flashcardsCount = 0;
        try {
          if (m.summaryJson) summary = JSON.parse(m.summaryJson);
          if (m.keyConceptsJson) conceptsCount = JSON.parse(m.keyConceptsJson).length;
          if (m.flashcardsJson) flashcardsCount = JSON.parse(m.flashcardsJson).length;
        } catch {}

        return {
          id: m.id,
          name: m.name,
          type: m.type,
          status: m.status,
          errorMessage: m.errorMessage,
          pages: m.pages,
          fileSize: m.fileSize,
          chunksCount: m._count.chunks,
          summary,
          conceptsCount,
          flashcardsCount,
          date: m.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        };
      }),
    });
  } catch (error) {
    console.error('[Get Materials Error]', error);
    res.status(500).json({ error: 'Failed to retrieve materials' });
  }
});

/**
 * Upload and ingest a real PDF document
 */
learnerRouter.post('/materials/upload', handleUploadMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ error: 'No PDF file provided. Please attach a file under the "file" field.' });
      return;
    }

    const originalName = req.file.originalname || 'Uploaded Document.pdf';
    const buffer = req.file.buffer;

    // 1. Verify file signature magic bytes
    if (!validatePdfSignature(buffer)) {
      res.status(400).json({ error: 'Invalid PDF format: Missing %PDF- magic signature.' });
      return;
    }

    // 2. Parse PDF and extract page-by-page text
    let extraction;
    try {
      extraction = await extractTextFromPdf(buffer);
    } catch (parseErr: any) {
      res.status(400).json({ error: parseErr.message || 'Failed to parse PDF document.' });
      return;
    }

    // 3. Handle Scanned / Image-Only PDFs
    if (extraction.isScannedOrEmpty) {
      const material = await prisma.learningMaterial.create({
        data: {
          userId,
          name: originalName,
          type: 'PDF',
          status: 'OCR_NEEDED',
          errorMessage: 'This document appears to be scanned or contains only images. OCR is required to extract readable text.',
          pages: extraction.totalPages,
          fileSize: req.file.size,
        },
      });

      // Save file safely to disk
      const filePath = await saveUploadedDocument(userId, material.id, buffer);
      await prisma.learningMaterial.update({
        where: { id: material.id },
        data: { filePath },
      });

      res.status(201).json({
        success: true,
        material: {
          id: material.id,
          name: material.name,
          type: material.type,
          status: 'OCR_NEEDED',
          errorMessage: material.errorMessage,
          pages: extraction.totalPages,
          fileSize: req.file.size,
          chunksCount: 0,
          date: 'Just now',
        },
      });
      return;
    }

    // 4. Overlapping chunking with page number attribution
    const chunkData = chunkExtractedPages(extraction.pages);

    // Create preliminary material in DB
    const material = await prisma.learningMaterial.create({
      data: {
        userId,
        name: originalName,
        type: 'PDF',
        status: 'PROCESSING',
        pages: extraction.totalPages,
        fileSize: req.file.size,
      },
    });

    // Save document file securely
    const filePath = await saveUploadedDocument(userId, material.id, buffer);

    // Save chunks to database
    if (chunkData.length > 0) {
      await prisma.documentChunk.createMany({
        data: chunkData.map((c) => ({
          materialId: material.id,
          chunkIndex: c.chunkIndex,
          pageNumber: c.pageNumber,
          content: c.content,
          tokenCount: c.tokenCount,
        })),
      });
    }

    // 5. Generate source-grounded learning features asynchronously / inline
    const [summary, keyConcepts, flashcards] = await Promise.all([
      generateDocumentSummary(chunkData),
      generateKeyConcepts(chunkData),
      generateFlashcards(chunkData),
    ]);

    // Update material with generated assets and READY status
    const updated = await prisma.learningMaterial.update({
      where: { id: material.id },
      data: {
        status: 'READY',
        filePath,
        summaryJson: JSON.stringify(summary),
        keyConceptsJson: JSON.stringify(keyConcepts),
        flashcardsJson: JSON.stringify(flashcards),
      },
    });

    res.status(201).json({
      success: true,
      material: {
        id: updated.id,
        name: updated.name,
        type: updated.type,
        status: updated.status,
        pages: updated.pages,
        fileSize: updated.fileSize,
        chunksCount: chunkData.length,
        summary,
        keyConcepts,
        flashcards,
        date: 'Just now',
      },
    });
  } catch (error: any) {
    console.error('[Upload Material Error]', error);
    res.status(500).json({ error: `Document ingestion failed: ${error?.message || 'Internal error'}` });
  }
});

/**
 * Get detailed material by ID (user isolated)
 */
learnerRouter.get('/materials/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const material = await prisma.learningMaterial.findFirst({
      where: { id, userId },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });

    if (!material) {
      res.status(404).json({ error: 'Material not found or access denied.' });
      return;
    }

    let summary: any = null;
    let keyConcepts: any = [];
    let flashcards: any = [];
    try {
      if (material.summaryJson) summary = JSON.parse(material.summaryJson);
      if (material.keyConceptsJson) keyConcepts = JSON.parse(material.keyConceptsJson);
      if (material.flashcardsJson) flashcards = JSON.parse(material.flashcardsJson);
    } catch {}

    res.json({
      success: true,
      material: {
        id: material.id,
        name: material.name,
        type: material.type,
        status: material.status,
        errorMessage: material.errorMessage,
        pages: material.pages,
        fileSize: material.fileSize,
        chunksCount: material._count.chunks,
        summary,
        keyConcepts,
        flashcards,
        date: material.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      },
    });
  } catch (error) {
    console.error('[Get Material Detail Error]', error);
    res.status(500).json({ error: 'Failed to retrieve material details' });
  }
});

/**
 * Get all chunks for a material (for document viewer / retrieval verification)
 */
learnerRouter.get('/materials/:id/chunks', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const material = await prisma.learningMaterial.findFirst({
      where: { id, userId },
    });

    if (!material) {
      res.status(404).json({ error: 'Material not found or access denied.' });
      return;
    }

    const chunks = await prisma.documentChunk.findMany({
      where: { materialId: id },
      orderBy: { chunkIndex: 'asc' },
    });

    res.json({
      success: true,
      materialId: id,
      totalChunks: chunks.length,
      chunks: chunks.map((c) => ({
        id: c.id,
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
        content: c.content,
        tokenCount: c.tokenCount,
      })),
    });
  } catch (error) {
    console.error('[Get Material Chunks Error]', error);
    res.status(500).json({ error: 'Failed to retrieve material chunks' });
  }
});

/**
 * Ask a source-grounded question against document chunks with page citations
 */
learnerRouter.post('/materials/:id/query', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const parseResult = DocumentQuerySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten().fieldErrors });
      return;
    }

    const material = await prisma.learningMaterial.findFirst({
      where: { id, userId },
    });

    if (!material) {
      res.status(404).json({ error: 'Material not found or access denied.' });
      return;
    }

    const chunks = await prisma.documentChunk.findMany({
      where: { materialId: id },
      orderBy: { chunkIndex: 'asc' },
    });

    if (chunks.length === 0) {
      res.json({
        success: true,
        answer: 'This document does not contain readable text chunks (e.g., it is scanned or empty). Please upload a text-readable PDF.',
        citations: [],
      });
      return;
    }

    const queryResponse = await answerDocumentQuery(
      parseResult.data.question,
      chunks.map((c) => ({
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
        content: c.content,
        tokenCount: c.tokenCount,
      }))
    );

    res.json({
      success: true,
      materialId: id,
      question: parseResult.data.question,
      answer: queryResponse.answer,
      citations: queryResponse.citations,
    });
  } catch (error) {
    console.error('[Material Query Error]', error);
    res.status(500).json({ error: 'Failed to process document question' });
  }
});

/**
 * Generate a dynamic quiz directly from the document content
 */
learnerRouter.post('/materials/:id/quiz', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const parseResult = DocumentQuizSchema.safeParse(req.body);
    const count = parseResult.success ? parseResult.data.count : 4;

    const material = await prisma.learningMaterial.findFirst({
      where: { id, userId },
    });

    if (!material) {
      res.status(404).json({ error: 'Material not found or access denied.' });
      return;
    }

    const chunks = await prisma.documentChunk.findMany({
      where: { materialId: id },
      orderBy: { chunkIndex: 'asc' },
    });

    if (chunks.length === 0) {
      res.status(400).json({ error: 'Cannot generate quiz for a document without readable text chunks.' });
      return;
    }

    const questions = await generateDocumentQuiz(
      chunks.map((c) => ({
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
        content: c.content,
        tokenCount: c.tokenCount,
      })),
      count
    );

    res.json({
      success: true,
      materialId: id,
      materialName: material.name,
      questions,
    });
  } catch (error) {
    console.error('[Material Quiz Error]', error);
    res.status(500).json({ error: 'Failed to generate document quiz' });
  }
});

/**
 * Legacy metadata-only registration (preserved for backward compatibility)
 */
learnerRouter.post('/materials', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = MaterialMetadataSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten().fieldErrors });
      return;
    }

    const userId = req.user!.id;
    const { name, type, pages, status } = parseResult.data;

    const material = await prisma.learningMaterial.create({
      data: {
        userId,
        name,
        type,
        pages,
        status,
        fileSize: 1024 * (pages * 45),
      },
    });

    res.status(201).json({
      success: true,
      material: {
        id: material.id,
        name: material.name,
        type: material.type,
        status: material.status,
        pages: material.pages,
        date: 'Just now',
      },
    });
  } catch (error) {
    console.error('[Create Material Error]', error);
    res.status(500).json({ error: 'Failed to register material' });
  }
});

/**
 * Delete a learning material, its chunks, and disk file (user isolated)
 */
learnerRouter.delete('/materials/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Strict user isolation: verify ownership
    const material = await prisma.learningMaterial.findFirst({
      where: { id, userId },
    });

    if (!material) {
      res.status(404).json({ error: 'Material not found or access denied.' });
      return;
    }

    // Delete stored file if it exists
    if (material.filePath) {
      await deleteDocumentFile(material.filePath);
    }

    // Delete DB record (cascade deletes chunks)
    await prisma.learningMaterial.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Material deleted successfully' });
  } catch (error) {
    console.error('[Delete Material Error]', error);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

/* -------------------------------------------------------------------------- */
/*                 Offline Synchronization & Conflict Handling                */
/* -------------------------------------------------------------------------- */

learnerRouter.get('/sync/status', (req: Request, res: Response): void => {
  res.json({
    success: true,
    userId: req.user!.id,
    userEmail: req.user!.email,
    serverTime: new Date().toISOString(),
  });
});

learnerRouter.post('/sync', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { events } = req.body;

    if (!Array.isArray(events)) {
      res.status(400).json({ error: 'Invalid payload: events must be an array' });
      return;
    }

    const processedEventIds: string[] = [];
    const conflicts: any[] = [];

    for (const evt of events) {
      const { eventId, eventType, timestamp, payload } = evt;
      if (!eventId || !eventType) continue;

      // Check if already processed
      const existingSync = await prisma.syncEvent.findUnique({
        where: { clientEventId: eventId },
      });
      if (existingSync) {
        processedEventIds.push(eventId);
        continue;
      }

      if (eventType === 'QUIZ_ATTEMPT') {
        const { topicId, topicName, score, totalQuestions, correctAnswers, answers } = payload;
        // Check if attempt already exists
        let attempt = await prisma.quizAttempt.findUnique({
          where: { clientEventId: eventId },
        });

        if (!attempt) {
          attempt = await prisma.quizAttempt.create({
            data: {
              userId,
              clientEventId: eventId,
              topicId,
              topicName,
              score,
              totalQuestions,
              correctAnswers,
              answersJson: JSON.stringify(answers || []),
              createdAt: timestamp ? new Date(timestamp) : new Date(),
            },
          });

          // Recalculate topic progress
          const percentageScore = (correctAnswers / totalQuestions) * 100;
          const existingProgress = await prisma.learnerProgress.findUnique({
            where: { userId_topicId: { userId, topicId } },
          });

          const newMastery = existingProgress
            ? Math.round(existingProgress.masteryScore * 0.7 + percentageScore * 0.3)
            : Math.round(percentageScore);

          await prisma.learnerProgress.upsert({
            where: { userId_topicId: { userId, topicId } },
            create: {
              userId,
              topicId,
              topicName,
              masteryScore: percentageScore,
              streakDays: percentageScore >= 60 ? 1 : 0,
              attemptCount: totalQuestions,
              correctCount: correctAnswers,
              lastPracticed: timestamp ? new Date(timestamp) : new Date(),
            },
            update: {
              masteryScore: newMastery,
              streakDays: percentageScore >= 60 ? (existingProgress?.streakDays ?? 0) + 1 : (existingProgress?.streakDays ?? 0),
              attemptCount: (existingProgress?.attemptCount ?? 0) + totalQuestions,
              correctCount: (existingProgress?.correctCount ?? 0) + correctAnswers,
              lastPracticed: timestamp ? new Date(timestamp) : new Date(),
            },
          });
        }
      } else if (eventType === 'PROGRESS_UPDATE') {
        const { topicId, topicName, masteryScore, streakDays, attemptDelta, correctDelta } = payload;
        const existing = await prisma.learnerProgress.findUnique({
          where: { userId_topicId: { userId, topicId } },
        });

        const clientDate = timestamp ? new Date(timestamp) : new Date(0);
        // Conflict detection: if server record was modified after client action timestamp
        if (existing && existing.updatedAt > clientDate) {
          conflicts.push({
            eventId,
            topicId,
            reason: 'Server record has newer timestamp',
            serverMastery: existing.masteryScore,
            clientMastery: masteryScore,
            resolution: 'merged_counts_preserve_higher_mastery',
          });

          // Merging strategy: accumulate practice counts, preserve the higher mastery score
          await prisma.learnerProgress.update({
            where: { userId_topicId: { userId, topicId } },
            data: {
              masteryScore: Math.max(existing.masteryScore, masteryScore),
              attemptCount: existing.attemptCount + (attemptDelta ?? 1),
              correctCount: existing.correctCount + (correctDelta ?? 1),
            },
          });
        } else {
          await prisma.learnerProgress.upsert({
            where: { userId_topicId: { userId, topicId } },
            create: {
              userId,
              topicId,
              topicName,
              masteryScore,
              streakDays: streakDays ?? 1,
              attemptCount: attemptDelta ?? 1,
              correctCount: correctDelta ?? 1,
              lastPracticed: clientDate,
            },
            update: {
              masteryScore,
              streakDays: streakDays ?? ((existing?.streakDays ?? 0) + 1),
              attemptCount: (existing?.attemptCount ?? 0) + (attemptDelta ?? 1),
              correctCount: (existing?.correctCount ?? 0) + (correctDelta ?? 1),
              lastPracticed: clientDate,
            },
          });
        }
      } else if (eventType === 'PREFERENCES_UPDATE') {
        const clientDate = timestamp ? new Date(timestamp) : new Date(0);
        const existing = await prisma.userPreference.findUnique({ where: { userId } });
        if (existing && existing.updatedAt > clientDate) {
          conflicts.push({
            eventId,
            reason: 'Server preference timestamp is newer',
            resolution: 'server_state_retained',
          });
        } else {
          await prisma.userPreference.upsert({
            where: { userId },
            create: { userId, ...payload },
            update: payload,
          });
        }
      } else if (eventType === 'STUDY_TASK_COMPLETE') {
        const { taskId } = payload;
        if (taskId) {
          await completeStudyTask(userId, taskId).catch((err) =>
            console.warn('[Sync Study Task Error]', err)
          );
        }
      }

      // Record in sync_events table
      await prisma.syncEvent.create({
        data: {
          userId,
          clientEventId: eventId,
          eventType,
          payloadJson: JSON.stringify(payload || {}),
        },
      });

      processedEventIds.push(eventId);
    }

    // Return the updated server state after processing all sync events
    const latestProgress = await prisma.learnerProgress.findMany({ where: { userId } });
    const latestPrefs = await prisma.userPreference.findUnique({ where: { userId } });

    res.json({
      success: true,
      processedEventIds,
      conflicts,
      serverState: {
        progress: latestProgress,
        preferences: latestPrefs,
      },
    });
  } catch (error) {
    console.error('[Sync Error]', error);
    res.status(500).json({ error: 'Failed to process synchronization' });
  }
});

/**
 * -----------------------------------------------------------------------------
 * Milestone 7: Learning Twin and AI Insights Routes
 * -----------------------------------------------------------------------------
 */

/**
 * GET /api/learner/twin
 * Retrieve the authenticated learner's complete Learning Twin cognitive profile
 */
learnerRouter.get('/twin', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const profile = await buildLearnerTwinProfile(userId);
    res.json({ success: true, profile });
  } catch (error: any) {
    console.error('[Get Learner Twin Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to retrieve Learning Twin profile' });
  }
});

/**
 * POST /api/learner/twin/synthesize
 * Generate an evidence-grounded AI / deterministic coach summary for the learner
 */
learnerRouter.post('/twin/synthesize', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { allowCloudAi } = req.body;

    const [profile, insightsData, prefs] = await Promise.all([
      buildLearnerTwinProfile(userId),
      generateLearnerInsights(userId),
      prisma.userPreference.findUnique({ where: { userId } }),
    ]);

    const shouldAllowCloud =
      typeof allowCloudAi === 'boolean' ? allowCloudAi : Boolean(prefs?.cloudAI);

    const synthesis = await synthesizeTwinProfile(profile, insightsData.insights, {
      allowCloudAi: shouldAllowCloud,
    });

    res.json({ success: true, synthesis });
  } catch (error: any) {
    console.error('[Synthesize Twin Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to synthesize Learning Twin' });
  }
});

/**
 * GET /api/learner/insights
 * Retrieve evidence-based insights mined over the learner's actual study records
 */
learnerRouter.get('/insights', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await generateLearnerInsights(userId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[Get Learner Insights Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to retrieve learning insights' });
  }
});

/**
 * POST /api/learner/insights/:id/schedule
 * 1-Click schedule an insight recommendation into the user's Study Plan
 */
learnerRouter.post('/insights/:id/schedule', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { targetDate } = req.body;

    const result = await scheduleInsightAsTask(userId, id, targetDate);
    res.json(result);
  } catch (error: any) {
    console.error('[Schedule Insight Task Error]', error);
    res.status(500).json({ error: error?.message || 'Failed to schedule insight recommendation' });
  }
});
