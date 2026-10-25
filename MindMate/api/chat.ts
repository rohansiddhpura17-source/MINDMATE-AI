import type { VercelRequest, VercelResponse } from '@vercel/node';

// Verified against Google Generative Language API
const GEMINI_MODELS = [
  'gemini-3.5-flash',       // Primary: verified available and working
  'gemini-2.5-flash',       // Fallback 1: verified in available catalog
  'gemini-flash-latest',    // Fallback 2: latest flash alias
  'gemini-2.5-flash-lite',  // Fallback 3: lightweight alternative
];

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface ModelCallResult {
  ok: boolean;
  text?: string;
  status?: number;
  errorMsg?: string;
  isFatal?: boolean;
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string
): Promise<ModelCallResult> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (e: any) {
    const isTimeout = e?.name === 'AbortError';
    return {
      ok: false,
      errorMsg: isTimeout ? 'Request timed out' : `Network error: ${e?.message || 'unknown'}`,
      isFatal: false,
    };
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg: string = (data as any)?.error?.message || `HTTP ${res.status}`;
    const isFatal = res.status === 400 || res.status === 401 || res.status === 403 || res.status === 429;
    return { ok: false, status: res.status, errorMsg: msg, isFatal };
  }

  const candidate = (data as any)?.candidates?.[0];
  if (candidate?.finishReason === 'SAFETY') {
    return {
      ok: false,
      errorMsg: 'Response filtered for safety. Please rephrase your question.',
      isFatal: true,
    };
  }

  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: any) => p.text || '').join('') : '';

  if (!text.trim()) {
    return { ok: false, errorMsg: 'Empty response returned by model.', isFatal: false };
  }

  return { ok: true, text };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    message,
    topic,
    learningStyle,
    masteryLevel,
    history,
    learner,
    topics,
    quizMode,
    quizQuestion,
    quizTopic,
  } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Valid message string is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      content:
        'AI tutor is currently offline. Please configure GEMINI_API_KEY in your deployment environment variables.',
      answer:
        'AI tutor is currently offline. Please configure GEMINI_API_KEY in your deployment environment variables.',
    });
  }

  const targetTopic = quizTopic || topic || 'General CS concepts';
  let action: 'chat' | 'startQuiz' | 'checkAnswer' = 'chat';
  let prompt = '';

  // Determine prompt based on quizMode features from ai-integration
  if (quizMode && !quizQuestion) {
    action = 'startQuiz';
    prompt = `You are MindMate, an adaptive AI quiz tutor.
Topic: ${targetTopic}
Learner: ${JSON.stringify(learner || { learningStyle: learningStyle || 'Examples first', mastery: masteryLevel || 48 })}

Create exactly ONE beginner-friendly quiz question about this topic.
Include a brief code example if appropriate.
Do not reveal the answer.

Return ONLY valid JSON in this exact structure without markdown fences:
{
  "question": "The question shown to the learner"
}`;
  } else if (quizMode && quizQuestion) {
    action = 'checkAnswer';
    prompt = `You are MindMate's quiz evaluator.
Topic: ${targetTopic}
Learner: ${JSON.stringify(learner || { learningStyle: learningStyle || 'Examples first', mastery: masteryLevel || 48 })}
Current question: ${quizQuestion}
Learner's answer: ${message}

Evaluate the learner's answer. Accept equivalent correct answers.
Give brief, encouraging feedback and then create exactly ONE new question on the same topic.
Do not reveal the new question's answer.

Return ONLY valid JSON in this exact structure without markdown fences:
{
  "isCorrect": true,
  "feedback": "Correct! Brief explanation.",
  "nextQuestion": "The next quiz question"
}`;
  } else {
    // Standard adaptive chat tutor prompt
    const historyText = Array.isArray(history)
      ? history
          .filter((m: any) => m && m.role && m.content)
          .slice(-8)
          .map((m: { role: string; content: string }) =>
            m.role === 'user' ? `Student: ${m.content}` : `Tutor: ${m.content}`
          )
          .join('\n')
      : '';

    const systemInstructions = [
      'You are MindMate, an adaptive AI tutor for computer science.',
      `Learning style preference: ${learner?.learningStyle || learningStyle || 'Examples first'}.`,
      `Current topic: ${targetTopic}.`,
      `Mastery level: ${learner?.overallMastery ?? masteryLevel ?? 48}%.`,
      topics ? `Topic mastery overview: ${JSON.stringify(topics)}` : '',
      'Guidelines:',
      '- If student asks to simplify, break down previous explanations into intuitive, everyday analogies.',
      '- If student asks for examples, provide clear, concise code blocks.',
      '- Format code inside ``` markdown blocks.',
      '- Keep explanations conversational, encouraging, and structured.',
    ]
      .filter(Boolean)
      .join('\n');

    prompt = [
      systemInstructions,
      historyText ? `\nRecent Conversation:\n${historyText}` : '',
      `\nStudent: ${message.trim()}`,
      '\nTutor:',
    ].join('\n');
  }

  let lastError = '';

  for (const model of GEMINI_MODELS) {
    const result = await callGemini(apiKey, model, prompt);

    if (result.ok && result.text) {
      const rawText = result.text.trim();

      // Handle structured JSON for quiz actions
      if (action === 'startQuiz') {
        try {
          const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (parsed.question) {
            return res.status(200).json({
              content: parsed.question,
              answer: parsed.question,
              quizQuestion: parsed.question,
              model,
            });
          }
        } catch {
          // If JSON parsing fails, return rawText directly
          return res.status(200).json({
            content: rawText,
            answer: rawText,
            quizQuestion: rawText,
            model,
          });
        }
      }

      if (action === 'checkAnswer') {
        try {
          const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (typeof parsed.isCorrect === 'boolean') {
            const formatted = `${parsed.feedback}\n\n**Next Question:**\n${parsed.nextQuestion}`;
            return res.status(200).json({
              content: formatted,
              answer: formatted,
              isCorrect: parsed.isCorrect,
              nextQuestion: parsed.nextQuestion,
              model,
            });
          }
        } catch {
          return res.status(200).json({
            content: rawText,
            answer: rawText,
            model,
          });
        }
      }

      return res.status(200).json({
        content: rawText,
        answer: rawText,
        model,
      });
    }

    lastError = result.errorMsg || 'Unknown provider error';

    if (result.isFatal) {
      break;
    }
  }

  // Sanitized fallback
  let userMessage = 'I could not generate a response right now. Please try again in a moment.';
  if (lastError.includes('quota') || lastError.includes('429')) {
    userMessage = 'Daily AI usage quota reached. Please try again shortly or check back tomorrow.';
  } else if (lastError.includes('API_KEY') || lastError.includes('403')) {
    userMessage = 'API configuration error. Please verify GEMINI_API_KEY in deployment settings.';
  } else if (lastError.includes('safety') || lastError.includes('SAFETY')) {
    userMessage = lastError;
  }

  return res.status(200).json({
    content: userMessage,
    answer: userMessage,
    status: 'error_fallback',
  });
}
