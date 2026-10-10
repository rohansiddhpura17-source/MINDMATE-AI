import { Router, Request, Response } from 'express';
import { searchImages } from '../services/imageSearch.js';
import { contentModerationService } from '../services/contentModeration.js';

export const visualRouter = Router();

/**
 * GET /api/visual/images?q=query&limit=6
 * Searches educational real-world images with full attribution & licenses
 */
visualRouter.get('/images', async (req: Request, res: Response) => {
  const query = (req.query.q as string || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit as string || '6', 10), 1), 12);

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  // Content safety guard: block explicit, pornographic, or unsafe queries
  const moderationResult = contentModerationService.evaluate(query);
  if (moderationResult.decision !== 'ALLOW' || !moderationResult.isSafeForVisual) {
    return res.json({
      query,
      items: [],
      total: 0,
      blocked: true,
      decision: moderationResult.decision,
      message: moderationResult.userExplanation
    });
  }

  try {
    const result = await searchImages(query, limit);
    return res.json(result);
  } catch (err: any) {
    console.error('[VisualRouter] Image search failed:', err);
    return res.status(500).json({ error: 'Failed to search educational images', details: err?.message });
  }
});

export default visualRouter;
