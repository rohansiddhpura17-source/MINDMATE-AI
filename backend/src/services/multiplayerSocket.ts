import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { prisma } from '../db.js';
import {
  getChallengeDetails,
  submitChallengeAnswer,
  FullChallengeQuestion,
} from './challenge.js';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  userName?: string;
  activeChallengeId?: string;
  isAlive?: boolean;
}

interface Room {
  challengeId: string;
  sockets: Set<AuthenticatedWebSocket>;
}

// In-memory active challenge rooms
const rooms = new Map<string, Room>();

/**
 * Gets or creates a room for a challenge.
 */
function getOrCreateRoom(challengeId: string): Room {
  let room = rooms.get(challengeId);
  if (!room) {
    room = {
      challengeId,
      sockets: new Set(),
    };
    rooms.set(challengeId, room);
  }
  return room;
}

/**
 * Broadcasts a message to all connected clients in a challenge room.
 */
function broadcastToRoom(challengeId: string, message: any, excludeWs?: AuthenticatedWebSocket) {
  const room = rooms.get(challengeId);
  if (!room) return;

  const data = JSON.stringify(message);
  for (const client of room.sockets) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

/**
 * Sends a JSON message to a single WebSocket.
 */
function sendJson(ws: WebSocket, message: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Initializes native WebSocket server on the HTTP server for real-time multiplayer duels.
 */
export function setupMultiplayerWebSocket(httpServer: HttpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/challenge',
  });

  // Heartbeat to prune dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((client: any) => {
      if (client.isAlive === false) {
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);
  interval.unref();

  wss.on('close', () => {
    clearInterval(interval);
  });

  wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    try {
      // Parse query string for token
      const reqUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      let token = reqUrl.searchParams.get('token');

      // Fallback: check cookie header
      if (!token && req.headers.cookie) {
        const match = req.headers.cookie.match(/mindmate_session=([^;]+)/);
        if (match) token = match[1];
      }

      if (!token) {
        sendJson(ws, { type: 'ERROR', message: 'Authentication required. Token missing.' });
        ws.close(4001, 'Unauthorized');
        return;
      }

      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { id: true, name: true, role: true } } },
      });

      if (!session || new Date() > session.expiresAt) {
        sendJson(ws, { type: 'ERROR', message: 'Session expired or invalid.' });
        ws.close(4001, 'Session invalid');
        return;
      }

      ws.userId = session.user.id;
      ws.userName = session.user.name;

      sendJson(ws, {
        type: 'AUTHENTICATED',
        userId: ws.userId,
        userName: ws.userName,
      });
    } catch (err: any) {
      console.error('[WebSocket] Auth error:', err);
      sendJson(ws, { type: 'ERROR', message: 'Authentication failed.' });
      ws.close(4001, 'Auth error');
      return;
    }

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleClientMessage(ws, msg);
      } catch (err: any) {
        console.error('[WebSocket] Message handling error:', err);
        sendJson(ws, { type: 'ERROR', message: err.message || 'Invalid message' });
      }
    });

    ws.on('close', () => {
      handleClientDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Socket error for user', ws.userId, err);
    });
  });

  console.log('[MindMate Realtime] Native WebSocket challenge server attached to /ws/challenge');
  return wss;
}

/**
 * Handles incoming client messages over WebSocket.
 */
async function handleClientMessage(ws: AuthenticatedWebSocket, msg: any) {
  if (!ws.userId) {
    sendJson(ws, { type: 'ERROR', message: 'Not authenticated' });
    return;
  }

  switch (msg.type) {
    case 'PING': {
      sendJson(ws, { type: 'PONG', timestamp: Date.now() });
      break;
    }

    case 'JOIN_CHALLENGE': {
      const { challengeId } = msg;
      if (!challengeId) {
        sendJson(ws, { type: 'ERROR', message: 'Missing challengeId' });
        return;
      }

      // Fetch challenge details (with server-side sanitization)
      const details = await getChallengeDetails(ws.userId, challengeId);
      const room = getOrCreateRoom(challengeId);

      // Clean up previous room if switching
      if (ws.activeChallengeId && ws.activeChallengeId !== challengeId) {
        const oldRoom = rooms.get(ws.activeChallengeId);
        if (oldRoom) oldRoom.sockets.delete(ws);
      }

      ws.activeChallengeId = challengeId;
      room.sockets.add(ws);

      // Collect connected player IDs in this room
      const connectedUserIds = Array.from(room.sockets).map(s => s.userId).filter(Boolean);
      const isOpponentConnected = connectedUserIds.some(id => id !== ws.userId);

      // Send challenge state to this user
      sendJson(ws, {
        type: 'CHALLENGE_STATE',
        challenge: details,
        isOpponentConnected,
        connectedCount: room.sockets.size,
      });

      // Notify the opponent that user has joined
      broadcastToRoom(challengeId, {
        type: 'PLAYER_JOINED',
        userId: ws.userId,
        userName: ws.userName,
        connectedCount: room.sockets.size,
      }, ws);

      // If both players are now connected, announce ready state
      if (room.sockets.size >= 2) {
        broadcastToRoom(challengeId, {
          type: 'ROOM_READY',
          message: 'Both players are connected! Ready for battle.',
          connectedUserIds,
        });
      }
      break;
    }

    case 'START_GAME': {
      const { challengeId } = msg;
      if (!challengeId) return;

      const challenge = await prisma.quizChallenge.findUnique({
        where: { id: challengeId },
      });

      if (!challenge) {
        sendJson(ws, { type: 'ERROR', message: 'Challenge not found' });
        return;
      }

      if (challenge.status === 'PENDING' || challenge.status === 'ACCEPTED') {
        await prisma.quizChallenge.update({
          where: { id: challengeId },
          data: { status: 'IN_PROGRESS' },
        });
      }

      // Broadcast countdown and match start to all players in the room
      broadcastToRoom(challengeId, {
        type: 'GAME_STARTED',
        challengeId,
        startedAt: new Date().toISOString(),
      });
      break;
    }

    case 'SUBMIT_ANSWER': {
      const { challengeId, questionIndex, selectedOption, timeTakenSeconds } = msg;

      if (!challengeId || typeof questionIndex !== 'number' || typeof selectedOption !== 'number') {
        sendJson(ws, { type: 'ERROR', message: 'Invalid submission parameters' });
        return;
      }

      try {
        const result = await submitChallengeAnswer(
          ws.userId,
          challengeId,
          questionIndex,
          selectedOption,
          timeTakenSeconds || 5
        );

        // Send detailed result to the submitter
        sendJson(ws, {
          type: 'ANSWER_EVALUATED',
          submissionId: result.submissionId,
          questionIndex: result.questionIndex,
          isCorrect: result.isCorrect,
          pointsEarned: result.pointsEarned,
          timeTakenSeconds: result.timeTakenSeconds,
          challengerScore: result.challengerScore,
          opponentScore: result.opponentScore,
          isUserFinished: result.isUserFinished,
          isOpponentFinished: result.isOpponentFinished,
        });

        // Broadcast public score & progress update to both players
        broadcastToRoom(challengeId, {
          type: 'LIVE_SCORE_UPDATE',
          challengerScore: result.challengerScore,
          opponentScore: result.opponentScore,
          submittingUserId: ws.userId,
          questionIndex: result.questionIndex,
          isUserFinished: result.isUserFinished,
          isOpponentFinished: result.isOpponentFinished,
        });

        // If the entire duel has concluded, broadcast final results with reveal of all answers
        if (result.isGameOver) {
          const finalDetails = await prisma.quizChallenge.findUnique({
            where: { id: challengeId },
            include: { submissions: true },
          });

          const fullQuestions: FullChallengeQuestion[] = JSON.parse(finalDetails!.questionsJson);

          broadcastToRoom(challengeId, {
            type: 'GAME_OVER',
            challengeId,
            winnerId: result.winnerId,
            isDraw: result.isDraw,
            challengerScore: result.challengerScore,
            opponentScore: result.opponentScore,
            fullQuestions,
            allSubmissions: finalDetails?.submissions || [],
          });
        }
      } catch (submitErr: any) {
        sendJson(ws, {
          type: 'SUBMISSION_ERROR',
          questionIndex,
          message: submitErr.message || 'Failed to submit answer',
        });
      }
      break;
    }

    case 'LEAVE_CHALLENGE': {
      handleClientDisconnect(ws);
      break;
    }

    default: {
      sendJson(ws, { type: 'UNKNOWN_COMMAND', received: msg.type });
    }
  }
}

/**
 * Cleans up player state when disconnected or leaving.
 */
function handleClientDisconnect(ws: AuthenticatedWebSocket) {
  if (ws.activeChallengeId) {
    const room = rooms.get(ws.activeChallengeId);
    if (room) {
      room.sockets.delete(ws);
      broadcastToRoom(ws.activeChallengeId, {
        type: 'PLAYER_DISCONNECTED',
        userId: ws.userId,
        userName: ws.userName,
        remainingPlayers: room.sockets.size,
      });

      if (room.sockets.size === 0) {
        rooms.delete(ws.activeChallengeId);
      }
    }
    ws.activeChallengeId = undefined;
  }
}
