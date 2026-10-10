
/**
 * ARCHITECTURAL NOTICE: STANDALONE PROTOTYPE SERVER (PORT 3001)
 * ==============================================================
 * This file is a standalone minimal demonstration server merged from the remote
 * GitHub repository (https://github.com/Champion-08/MindMate).
 *
 * ACTIVE PRODUCTION BACKEND:
 * - The primary full-featured backend for MindMate / AdaptLearn AI is located at `backend/`
 *   running on Port 4000 (TypeScript, Express, Prisma ORM, SQLite, SSE streaming AI Tutor,
 *   document ingestion, adaptive engine, study planner, Learning Twin, and WebSockets).
 * - The Vite frontend development server (`MindMate/vite.config.ts`) proxies all `/api`
 *   traffic directly to `http://localhost:4000`.
 *
 * STATUS:
 * - This port-3001 prototype is preserved intact as historical reference code.
 * - Do NOT run this prototype concurrently in production or development to avoid port
 *   conflicts and divergent state.
 */

import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3001;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'MindMate backend is running!',
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const {
      message,
      learner,
      topics,
      quizMode,
      quizQuestion,
      quizTopic,
    } = req.body ?? {};

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        error: 'Please enter a message.',
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Gemini API key is missing. Check your .env file.',
      });
    }

    const topic = quizTopic || 'Python Functions';
    let prompt;
    let action = 'chat';

    if (quizMode && !quizQuestion) {
      action = 'startQuiz';

      prompt = `You are MindMate, a personalized quiz tutor.

Topic: ${topic}
Learner profile: ${JSON.stringify(learner ?? {})}

Create ONE beginner-friendly quiz question about this topic.
Use a short code example if appropriate.
Do not reveal the answer.

Return ONLY valid JSON in this exact structure:
{
  "question": "The complete question shown to the learner"
}

The question must be a non-empty string. Do not include Markdown fences.`;
    } else if (quizMode && quizQuestion) {
      action = 'checkAnswer';

      prompt = `You are MindMate's quiz evaluator.

Topic: ${topic}
Learner profile: ${JSON.stringify(learner ?? {})}
Current question: ${quizQuestion}
Learner's answer: ${message}

Evaluate the learner's answer to the current question only.
Accept equivalent correct answers.
If the question asks which Python keyword defines a function, "def" is correct.
Give brief, encouraging feedback and then create exactly ONE new question on the same topic.
Do not reveal the new question's answer.

Return ONLY valid JSON in this exact structure:
{
  "isCorrect": true,
  "feedback": "Correct! Brief explanation.",
  "nextQuestion": "The next quiz question"
}

"isCorrect" must be a boolean. "feedback" and "nextQuestion" must be non-empty strings.
Do not claim that mastery scores have changed.
Do not include Markdown fences.`;
    } else {
      prompt = `You are MindMate, a personalized AI learning tutor.

LEARNER PROFILE:
${JSON.stringify(learner ?? {})}

TOPIC MASTERY:
${JSON.stringify(topics ?? [])}

PERSONALIZATION RULES:
- Explain concepts in simple, clear language.
- Respect the learner's preferred learning style.
- Start with examples if the preferred style is "Examples first".
- Prioritize weaker topics when relevant.
- Adjust difficulty using the supplied mastery scores.
- Answer the student's actual question.

STUDENT QUESTION:
${message}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: prompt,
    });

    const text = response.text || '';

    if (action === 'startQuiz') {
      let result;

      try {
        result = JSON.parse(text);
      } catch {
        console.error('Invalid quiz question response:', text);
        return res.status(502).json({
          error: 'The AI could not create a quiz question. Please try again.',
        });
      }

      if (typeof result.question !== 'string' || !result.question.trim()) {
        return res.status(502).json({
          error: 'The AI returned an invalid quiz question. Please try again.',
        });
      }

      return res.json({
        answer: result.question,
        quizQuestion: result.question,
      });
    }

    if (action === 'checkAnswer') {
      let result;

      try {
        result = JSON.parse(text);
      } catch {
        console.error('Invalid quiz evaluation response:', text);
        return res.status(502).json({
          error: 'The AI could not evaluate the answer. Please try again.',
        });
      }

      if (
        typeof result.isCorrect !== 'boolean' ||
        typeof result.feedback !== 'string' ||
        typeof result.nextQuestion !== 'string' ||
        !result.feedback.trim() ||
        !result.nextQuestion.trim()
      ) {
        return res.status(502).json({
          error: 'The AI returned incomplete quiz feedback. Please try again.',
        });
      }

      return res.json({
        answer: `${result.feedback}\n\nNext question:\n${result.nextQuestion}`,
        isCorrect: result.isCorrect,
        nextQuestion: result.nextQuestion,
      });
    }

    return res.json({
      answer: text || 'Please try asking your question again.',
    });
  } catch (error) {
    console.error('Gemini request failed:', error.message);

    res.status(502).json({
      error: 'The AI tutor is temporarily unavailable. Please try again.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`MindMate backend running at http://localhost:${PORT}`);
});