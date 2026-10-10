/**
 * MindMate - Local Database Bridge for Imported Friend Models
 * 
 * Provides local API endpoints corresponding to the friend's Supabase tables
 * (profiles, topics, chat_messages, quiz_sessions, planner_tasks, materials, insights)
 * backed by our local SQLite database via Prisma.
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Helper: Seed initial topics, insights, and planner tasks if newly requested
async function ensureFriendSeedData(userId: string) {
  // 1. Ensure Profile exists
  const existingProfile = await prisma.profile.findFirst({
    where: { OR: [{ id: userId }, { userId }] },
  });

  if (!existingProfile) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await prisma.profile.create({
        data: {
          id: user.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          goal: user.goal || 'Master computer science concepts',
          learningStyle: 'Examples first',
          streak: 0,
          overallMastery: 0,
        },
      });
    }
  }

  // 2. Ensure Topics exist
  const topicCount = await prisma.friendTopic.count({ where: { userId } });
  if (topicCount === 0) {
    const defaultTopics = ['Variables', 'Conditions', 'Loops', 'Functions', 'OOP', 'DBMS'];
    for (const name of defaultTopics) {
      await prisma.friendTopic.create({
        data: {
          userId,
          name,
          mastery: 0,
          status: 'not-started',
          subject: 'Computer Science',
        },
      });
    }
  }

  // 3. Ensure Insights exist
  const insightCount = await prisma.insight.count({ where: { userId } });
  if (insightCount === 0) {
    await prisma.insight.createMany({
      data: [
        {
          userId,
          type: 'behavior',
          title: 'Performance drops in long sessions',
          description: 'Your accuracy drops after 45+ minute sessions. Shorter focused sessions improve retention.',
          action: 'Adjust schedule',
        },
        {
          userId,
          type: 'mastery',
          title: 'Start your learning journey',
          description: 'Complete your first quiz to see personalized insights here.',
          action: 'Take a quiz',
        },
      ],
    });
  }

  // 4. Ensure Planner tasks exist
  const plannerCount = await prisma.plannerTask.count({ where: { userId } });
  if (plannerCount === 0) {
    await prisma.plannerTask.createMany({
      data: [
        { userId, day: 'Mon', name: 'Python Functions', duration: '25 min', type: 'practice' },
        { userId, day: 'Tue', name: 'OOP Recovery', duration: '30 min', type: 'recovery' },
        { userId, day: 'Wed', name: 'DBMS Review', duration: '25 min', type: 'review' },
        { userId, day: 'Thu', name: 'Quiz Session', duration: '20 min', type: 'quiz' },
        { userId, day: 'Fri', name: 'Mock Assessment', duration: '40 min', type: 'assessment' },
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// 1. PROFILES
// ---------------------------------------------------------------------------

router.get('/profiles/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const targetId = req.params.userId === 'me' ? (req as any).user.id : req.params.userId;
    await ensureFriendSeedData(targetId);

    const profile = await prisma.profile.findFirst({
      where: { OR: [{ id: targetId }, { userId: targetId }] },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.json({ data: profile });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.patch('/profiles/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const targetId = req.params.userId === 'me' ? (req as any).user.id : req.params.userId;
    const { name, goal, learning_style, preferred_session } = req.body;

    const profile = await prisma.profile.updateMany({
      where: { OR: [{ id: targetId }, { userId: targetId }] },
      data: {
        ...(name !== undefined && { name }),
        ...(goal !== undefined && { goal }),
        ...(learning_style !== undefined && { learningStyle: learning_style }),
        ...(preferred_session !== undefined && { preferredSession: preferred_session }),
      },
    });

    return res.json({ success: true, count: profile.count });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// 2. TOPICS
// ---------------------------------------------------------------------------

router.get('/topics', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    await ensureFriendSeedData(userId);

    const topics = await prisma.friendTopic.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    return res.json({ data: topics });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.patch('/topics/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { mastery } = req.body;

    const status = mastery >= 86 ? 'mastered' : mastery >= 71 ? 'strong' : mastery >= 51 ? 'developing' : mastery >= 31 ? 'needs-work' : 'critical';

    const updated = await prisma.friendTopic.update({
      where: { id },
      data: { mastery, status },
    });

    return res.json({ data: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// 3. CHAT MESSAGES
// ---------------------------------------------------------------------------

router.get('/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const limit = parseInt(req.query.limit as string) || 20;

    const messages = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return res.json({ data: messages });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { role, content, topic } = req.body;

    const created = await prisma.chatMessage.create({
      data: {
        userId,
        role,
        content,
        topic,
      },
    });

    return res.status(201).json({ data: created });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// 4. QUIZ SESSIONS
// ---------------------------------------------------------------------------

router.get('/quiz', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const sessions = await prisma.quizSession.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: 10,
    });

    return res.json({ data: sessions });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/quiz', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { topic, score, total, accuracy, main_gap } = req.body;

    const created = await prisma.quizSession.create({
      data: {
        userId,
        topic,
        score: score || 0,
        total: total || 0,
        accuracy: accuracy || 0,
        mainGap: main_gap,
      },
    });

    return res.status(201).json({ data: created });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// 5. PLANNER TASKS
// ---------------------------------------------------------------------------

router.get('/planner', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    await ensureFriendSeedData(userId);

    const tasks = await prisma.plannerTask.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    return res.json({ data: tasks });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.patch('/planner/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { completed } = req.body;

    const updated = await prisma.plannerTask.update({
      where: { id },
      data: { completed: Boolean(completed) },
    });

    return res.json({ data: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// 6. MATERIALS
// ---------------------------------------------------------------------------

router.get('/materials', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const materials = await prisma.material.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ data: materials });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/materials', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { name, type, raw_content, summary, key_concepts } = req.body;

    const created = await prisma.material.create({
      data: {
        userId,
        name,
        type: type || 'Text',
        status: 'ready',
        rawContent: raw_content,
        summary,
        keyConcepts: key_concepts,
      },
    });

    return res.status(201).json({ data: created });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/materials/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.material.delete({
      where: { id },
    });

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// 7. INSIGHTS
// ---------------------------------------------------------------------------

router.get('/insights', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    await ensureFriendSeedData(userId);

    const insights = await prisma.insight.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ data: insights });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.patch('/insights/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await prisma.insight.update({
      where: { id },
      data: { isRead: true },
    });

    return res.json({ data: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
