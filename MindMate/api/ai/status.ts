import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
  const hasValidKey = Boolean(apiKey && apiKey.trim().length > 10 && !apiKey.includes('placeholder'));

  res.status(200).json({
    status: 'ok',
    configured: hasValidKey,
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    hasKey: hasValidKey,
    message: hasValidKey
      ? 'Cloud AI is active using Google Gemini (gemini-3.5-flash).'
      : 'Cloud AI key not configured. Add GEMINI_API_KEY to environment variables or switch to Offline mode.',
  });
}
