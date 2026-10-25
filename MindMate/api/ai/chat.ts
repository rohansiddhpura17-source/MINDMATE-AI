import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
];

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const {
    messages = [],
    message,
    systemPrompt,
    temperature = 0.7,
    maxTokens = 2048,
    stream = true,
    learnerProfile,
    topic,
  } = body;

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

  // Standardize messages array
  const formattedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = Array.isArray(messages) && messages.length > 0
    ? messages
    : message
    ? [{ role: 'user', content: String(message) }]
    : [];

  if (formattedMessages.length === 0) {
    return res.status(400).json({ error: 'At least one message is required' });
  }

  // Pre-flight basic safety
  const lastUserMsg = formattedMessages.filter((m) => m.role === 'user').pop()?.content || '';
  const lowerMsg = lastUserMsg.toLowerCase();
  if (
    lowerMsg.includes('porn') ||
    lowerMsg.includes('blowjob') ||
    lowerMsg.includes('xxx') ||
    lowerMsg.includes('onlyfans') ||
    lowerMsg.includes('pornhub')
  ) {
    const refusal = "MindMate is designed for educational learning. I cannot assist with adult or sexually explicit content. Let's focus on an academic subject, coding topic, or skill you'd like to explore.";
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ chunk: refusal, model: 'content-safety-guard', source: 'guard' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    return res.status(200).json({ content: refusal, model: 'content-safety-guard', source: 'guard' });
  }

  if (!apiKey || apiKey.trim().length < 10) {
    const fallbackMsg = 'Cloud AI key not configured. Please add GEMINI_API_KEY to environment variables or switch to Offline WebGPU mode.';
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ chunk: fallbackMsg, model: 'offline-notice', source: 'mock-fallback' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    return res.status(200).json({ content: fallbackMsg, model: 'offline-notice', source: 'mock-fallback' });
  }

  // Build system instructions
  let sysInstruction = systemPrompt || 'You are MindMate, an adaptive educational AI tutor.';
  if (learnerProfile) {
    sysInstruction += `\nLearner: ${learnerProfile.name || 'Alex'} | Style: ${learnerProfile.learningStyle || 'Examples first'} | Goal: ${learnerProfile.goal || 'General'}`;
  }
  if (topic) {
    sysInstruction += `\nCurrent Topic: ${topic}`;
  }

  // Build alternating Gemini contents
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const m of formattedMessages) {
    if (!m.content || !m.content.trim()) continue;
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (contents.length === 0 && role === 'model') continue;
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n\n' + m.content.trim();
    } else {
      contents.push({ role, parts: [{ text: m.content.trim() }] });
    }
  }

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello MindMate!' }] });
  }

  const payload = {
    contents,
    systemInstruction: { parts: [{ text: sysInstruction }] },
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let streamSucceeded = false;

    for (const model of GEMINI_MODELS) {
      try {
        const streamUrl = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
        const geminiRes = await fetch(streamUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!geminiRes.ok || !geminiRes.body) {
          continue;
        }

        const reader = geminiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6).trim();
              if (jsonStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (chunkText) {
                  res.write(`data: ${JSON.stringify({ chunk: chunkText, model, source: 'cloud' })}\n\n`);
                }
              } catch {}
            }
          }
        }

        reader.releaseLock();
        res.write('data: [DONE]\n\n');
        streamSucceeded = true;
        break;
      } catch (err) {
        continue;
      }
    }

    if (!streamSucceeded) {
      res.write(
        `data: ${JSON.stringify({
          chunk: 'Could not contact online AI provider. Please try again or switch to Offline mode.',
          model: 'error',
          source: 'cloud',
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
    }

    return res.end();
  } else {
    // Non-streaming response
    for (const model of GEMINI_MODELS) {
      try {
        const genUrl = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
        const geminiRes = await fetch(genUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
          if (text) {
            return res.status(200).json({ content: text, model, source: 'cloud' });
          }
        }
      } catch {}
    }

    return res.status(200).json({
      content: 'Could not contact online AI provider. Please try again or switch to Offline mode.',
      model: 'error',
      source: 'cloud',
    });
  }
}
