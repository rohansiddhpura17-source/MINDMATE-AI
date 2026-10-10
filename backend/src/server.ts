import http from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { aiRouter } from './routes/ai.js';
import { authRouter } from './routes/auth.js';
import { learnerRouter } from './routes/learner.js';
import { socialRouter } from './routes/social.js';
import dbBridgeRouter from './routes/dbBridge.js';
import { visualRouter } from './routes/visual.js';
import { setupMultiplayerWebSocket } from './services/multiplayerSocket.js';

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

// Initialize native WebSocket server for multiplayer quiz duels
setupMultiplayerWebSocket(httpServer);

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in dev while retaining credentials: true
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'adaptlearn-backend', timestamp: new Date().toISOString() });
});
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'adaptlearn-backend', timestamp: new Date().toISOString() });
});

// Auth & Session Routes
app.use('/api/auth', authRouter);

// Persistent Learner Data Routes
app.use('/api/learner', learnerRouter);

// Social Learning & Multiplayer Challenge Routes
app.use('/api/social', socialRouter);

// AI Routes (Milestone 1 Hybrid AI Tutor)
app.use('/api/ai', aiRouter);

// Local DB Bridge Routes (Imported Friend MindMate Models)
app.use('/api/db', dbBridgeRouter);

// Visual Learning Engine Routes (Real-World Image Search & Media)
app.use('/api/visual', visualRouter);

// Global 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Backend Server Error]', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

const isMainModule = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (process.env.NODE_ENV !== 'test' && isMainModule) {
  httpServer.listen(PORT, () => {
    console.log(`[MindMate Backend] Server running on http://localhost:${PORT}`);
  });
}

export { app, httpServer };
export default app;
