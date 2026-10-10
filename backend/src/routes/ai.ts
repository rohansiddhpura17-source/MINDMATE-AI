import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { cloudAIService } from '../services/ai.js';
import { contentModerationService } from '../services/contentModeration.js';

export const aiRouter = Router();

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, 'Message content cannot be empty')
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1, 'At least one message is required'),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().max(4096).optional(),
  stream: z.boolean().optional().default(true)
});

// GET /api/ai/status
aiRouter.get('/status', (_req: Request, res: Response) => {
  const status = cloudAIService.getStatus();
  res.json({
    status: 'ok',
    ...status
  });
});

// POST /api/ai/chat
aiRouter.post('/chat', async (req: Request, res: Response) => {
  const parseResult = chatRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request payload',
      details: parseResult.error.format()
    });
    return;
  }

  const { messages, systemPrompt, temperature, maxTokens, stream } = parseResult.data;

  // Content moderation check across latest message and conversational context
  const userMessages = messages.filter((m) => m.role === 'user');
  const lastUserMessage = userMessages[userMessages.length - 1]?.content || '';
  const prevUserMessage = userMessages.length > 1 ? userMessages[userMessages.length - 2]?.content : undefined;
  const assistantMessages = messages.filter((m) => m.role === 'assistant');
  const prevAssistantMessage = assistantMessages[assistantMessages.length - 1]?.content;

  const moderationResult = contentModerationService.evaluate(lastUserMessage, {
    previousQuestion: prevUserMessage,
    previousAnswer: prevAssistantMessage
  });

  if (moderationResult.decision !== 'ALLOW') {
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      res.write(
        `data: ${JSON.stringify({
          chunk: moderationResult.userExplanation,
          model: 'content-safety-guard',
          source: 'guard',
          blocked: true,
          decision: moderationResult.decision
        })}\n\n`
      );
      res.write(`data: [DONE]\n\n`);
      res.end();
      return;
    } else {
      res.json({
        content: moderationResult.userExplanation,
        model: 'content-safety-guard',
        source: 'guard',
        blocked: true,
        decision: moderationResult.decision
      });
      return;
    }
  }

  // Check if provider is configured
  const providerStatus = cloudAIService.getStatus();
  if (!providerStatus.configured) {
    res.status(503).json({
      error: 'Cloud AI provider is not configured with an API key',
      message: providerStatus.message,
      provider: providerStatus.provider
    });
    return;
  }

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let isClientConnected = true;
    res.on('close', () => {
      isClientConnected = false;
    });

    console.log('[Stream Route] Starting stream...');
    try {
      const generator = cloudAIService.streamChat({
        messages,
        systemPrompt,
        temperature,
        maxTokens
      });

      console.log('[Stream Route] Waiting for generator chunks...');
      for await (const chunk of generator) {
        if (!isClientConnected) {
          console.log('[Stream Route] Client disconnected, breaking');
          break;
        }
        console.log('[Stream Route] Sending chunk to client:', chunk.slice(0, 30));
        res.write(`data: ${JSON.stringify({ chunk, model: providerStatus.model, source: 'cloud' })}\n\n`);
      }

      console.log('[Stream Route] Generator finished, sending DONE');
      if (isClientConnected) {
        res.write(`data: [DONE]\n\n`);
        res.end();
      }
    } catch (err: any) {
      console.error('[Stream Route Error]', err);
      if (isClientConnected) {
        res.write(`data: ${JSON.stringify({ error: err.message || 'Stream generation failed' })}\n\n`);
        res.end();
      }
    }
  } else {
    try {
      let fullText = '';
      const generator = cloudAIService.streamChat({
        messages,
        systemPrompt,
        temperature,
        maxTokens
      });

      for await (const chunk of generator) {
        fullText += chunk;
      }

      res.json({
        content: fullText,
        source: 'cloud',
        model: providerStatus.model
      });
    } catch (err: any) {
      res.status(500).json({
        error: err.message || 'Failed to generate AI response'
      });
    }
  }
});
