import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  goal: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionToken?: string;
    }
  }
}

export const SESSION_COOKIE_NAME = 'mindmate_session';

/**
 * Authentication middleware that verifies session token from HTTP-only cookie or Authorization header.
 * Attaches authenticated user to `req.user`.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token = req.cookies?.[SESSION_COOKIE_NAME];

    // Fallback: Check Authorization header
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }

    if (!token) {
      res.status(401).json({ error: 'Authentication required. Please log in.' });
      return;
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            goal: true,
          },
        },
      },
    });

    if (!session) {
      res.status(401).json({ error: 'Session not found. Please log in again.' });
      return;
    }

    if (session.expiresAt < new Date()) {
      // Clean up expired session
      await prisma.session.delete({ where: { token } }).catch(() => {});
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
      res.status(401).json({ error: 'Session expired. Please log in again.' });
      return;
    }

    req.user = session.user;
    req.sessionToken = token;
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]', error);
    res.status(500).json({ error: 'Internal authentication error' });
  }
}
