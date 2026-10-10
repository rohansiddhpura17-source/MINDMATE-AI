import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  getFriendshipOverview,
} from '../services/friendship.js';
import {
  createQuizChallenge,
  acceptChallenge,
  declineChallenge,
  cancelChallenge,
  getChallengeDetails,
  submitChallengeAnswer,
  listUserChallenges,
  getLeaderboard,
  getUserAchievements,
} from '../services/challenge.js';

export const socialRouter = Router();

// Apply auth to all social routes
socialRouter.use(requireAuth);

/**
 * GET /api/social/users/search
 * Privacy-conscious search for peers without exposing private emails.
 */
socialRouter.get('/users/search', async (req, res) => {
  try {
    const q = req.query.q as string || '';
    const users = await searchUsers(req.user!.id, q);
    res.json({ users });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to search users' });
  }
});

/**
 * GET /api/social/friends
 * Get friendship overview: current friends, incoming requests, outgoing requests.
 */
socialRouter.get('/friends', async (req, res) => {
  try {
    const overview = await getFriendshipOverview(req.user!.id);
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get friendship overview' });
  }
});

/**
 * POST /api/social/friends/request
 * Send a friend request.
 */
socialRouter.post('/friends/request', async (req, res) => {
  try {
    const { addresseeId } = req.body;
    if (!addresseeId) {
      return res.status(400).json({ error: 'addresseeId is required' });
    }
    const result = await sendFriendRequest(req.user!.id, addresseeId);
    res.status(201).json({ success: true, friendship: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to send friend request' });
  }
});

/**
 * POST /api/social/friends/accept
 * Accept an incoming friend request.
 */
socialRouter.post('/friends/accept', async (req, res) => {
  try {
    const { friendshipId } = req.body;
    if (!friendshipId) {
      return res.status(400).json({ error: 'friendshipId is required' });
    }
    const result = await acceptFriendRequest(req.user!.id, friendshipId);
    res.json({ success: true, friendship: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to accept friend request' });
  }
});

/**
 * POST /api/social/friends/decline
 * Decline a pending friend request.
 */
socialRouter.post('/friends/decline', async (req, res) => {
  try {
    const { friendshipId } = req.body;
    if (!friendshipId) {
      return res.status(400).json({ error: 'friendshipId is required' });
    }
    const result = await declineFriendRequest(req.user!.id, friendshipId);
    res.json({ success: true, friendship: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to decline friend request' });
  }
});

/**
 * POST /api/social/friends/cancel
 * Cancel an outgoing friend request.
 */
socialRouter.post('/friends/cancel', async (req, res) => {
  try {
    const { friendshipId } = req.body;
    if (!friendshipId) {
      return res.status(400).json({ error: 'friendshipId is required' });
    }
    const result = await cancelFriendRequest(req.user!.id, friendshipId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to cancel friend request' });
  }
});

/**
 * POST /api/social/friends/remove
 * Remove a friend.
 */
socialRouter.post('/friends/remove', async (req, res) => {
  try {
    const { friendshipId } = req.body;
    if (!friendshipId) {
      return res.status(400).json({ error: 'friendshipId is required' });
    }
    const result = await removeFriend(req.user!.id, friendshipId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to remove friend' });
  }
});

/**
 * GET /api/social/challenges
 * List active and past challenges.
 */
socialRouter.get('/challenges', async (req, res) => {
  try {
    const data = await listUserChallenges(req.user!.id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list challenges' });
  }
});

/**
 * POST /api/social/challenges
 * Create a new challenge.
 */
socialRouter.post('/challenges', async (req, res) => {
  try {
    const { opponentId, topic, difficulty, questionsCount } = req.body;
    if (!opponentId) {
      return res.status(400).json({ error: 'opponentId is required' });
    }
    const challenge = await createQuizChallenge(
      req.user!.id,
      opponentId,
      topic || 'data-structures',
      difficulty || 'adaptive',
      questionsCount ? parseInt(questionsCount, 10) : 5
    );
    res.status(201).json({ success: true, challenge });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create challenge' });
  }
});

/**
 * GET /api/social/challenges/:id
 * Get details of a challenge (sanitized questions).
 */
socialRouter.get('/challenges/:id', async (req, res) => {
  try {
    const details = await getChallengeDetails(req.user!.id, req.params.id);
    res.json(details);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Challenge not found' });
  }
});

/**
 * POST /api/social/challenges/:id/accept
 * Accept an incoming challenge.
 */
socialRouter.post('/challenges/:id/accept', async (req, res) => {
  try {
    const challenge = await acceptChallenge(req.user!.id, req.params.id);
    res.json({ success: true, challenge });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to accept challenge' });
  }
});

/**
 * POST /api/social/challenges/:id/decline
 * Decline a challenge.
 */
socialRouter.post('/challenges/:id/decline', async (req, res) => {
  try {
    const challenge = await declineChallenge(req.user!.id, req.params.id);
    res.json({ success: true, challenge });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to decline challenge' });
  }
});

/**
 * POST /api/social/challenges/:id/cancel
 * Cancel a pending challenge.
 */
socialRouter.post('/challenges/:id/cancel', async (req, res) => {
  try {
    const challenge = await cancelChallenge(req.user!.id, req.params.id);
    res.json({ success: true, challenge });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to cancel challenge' });
  }
});

/**
 * POST /api/social/challenges/:id/submit
 * Authoritative answer submission via REST.
 */
socialRouter.post('/challenges/:id/submit', async (req, res) => {
  try {
    const { questionIndex, selectedOption, timeTakenSeconds } = req.body;
    if (typeof questionIndex !== 'number' || typeof selectedOption !== 'number') {
      return res.status(400).json({ error: 'questionIndex and selectedOption are required numbers' });
    }
    const result = await submitChallengeAnswer(
      req.user!.id,
      req.params.id,
      questionIndex,
      selectedOption,
      timeTakenSeconds || 5
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit answer' });
  }
});

/**
 * GET /api/social/leaderboard
 * Authentic leaderboard rankings based on challenges and quizzes.
 */
socialRouter.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = await getLeaderboard(req.user!.id);
    res.json(leaderboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load leaderboard' });
  }
});

/**
 * GET /api/social/achievements
 * Get user badges and achievements.
 */
socialRouter.get('/achievements', async (req, res) => {
  try {
    const data = await getUserAchievements(req.user!.id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load achievements' });
  }
});
