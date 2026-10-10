import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, SESSION_COOKIE_NAME } from '../middleware/auth.js';
import { createRateLimiter, resetRateLimit } from '../middleware/rateLimiter.js';

export const authRouter = Router();

const RegisterSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  email: z.string().email('Invalid email address').transform((e) => e.toLowerCase().trim()),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  goal: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address').transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
});

const SESSION_EXPIRY_DAYS = 7;

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

// Rate-limited login: 10 attempts per 15 minutes
const loginRateLimiter = createRateLimiter(10, 15 * 60 * 1000);

/**
 * POST /api/auth/register
 */
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = RegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { name, email, password, goal } = parseResult.data;

    // Check existing email
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user and associated initial data
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        goal: goal || null,
        preferences: {
          create: {
            adaptiveDifficulty: true,
            personalizedRecs: true,
            proactiveAI: true,
            learningInsights: true,
            cloudAI: false,
            learningStyle: 'visual',
            dailyGoalMinutes: 30,
          },
        },
        progress: {
          createMany: {
            data: [
              { topicId: 'python-funcs', topicName: 'Python Functions', masteryScore: 50, attemptCount: 0, correctCount: 0, streakDays: 0 },
              { topicId: 'oop-basics', topicName: 'Object-Oriented Programming (OOP)', masteryScore: 50, attemptCount: 0, correctCount: 0, streakDays: 0 },
              { topicId: 'data-structs', topicName: 'Data Structures & Algorithms', masteryScore: 50, attemptCount: 0, correctCount: 0, streakDays: 0 },
              { topicId: 'web-basics', topicName: 'Web & API Fundamentals', masteryScore: 50, attemptCount: 0, correctCount: 0, streakDays: 0 },
            ],
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        goal: true,
        createdAt: true,
      },
    });

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
    res.status(201).json({
      success: true,
      user,
      token, // Also return token for clients that prefer Bearer auth
    });
  } catch (error) {
    console.error('[Register Error]', error);
    res.status(500).json({ error: 'Failed to create account. Please try again later.' });
  }
});

/**
 * POST /api/auth/login
 */
authRouter.post('/login', loginRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { email, password } = parseResult.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    // Reset rate limiter on successful login
    resetRateLimit(req);

    // Generate new session token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        goal: user.goal,
      },
      token,
    });
  } catch (error) {
    console.error('[Login Error]', error);
    res.status(500).json({ error: 'Login failed. Please try again later.' });
  }
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    let token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }

    if (token) {
      await prisma.session.delete({ where: { token } }).catch(() => {});
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    console.error('[Logout Error]', error);
    res.status(500).json({ error: 'Logout failed.' });
  }
});

/**
 * GET /api/auth/me - Session restoration & user profile
 */
authRouter.get('/me', requireAuth, (req: Request, res: Response): void => {
  res.json({
    success: true,
    user: req.user,
  });
});
