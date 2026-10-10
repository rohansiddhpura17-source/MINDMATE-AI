import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentModerationService,
  evaluateContentModeration,
  MODERATION_EXPLANATIONS
} from '../src/services/safety/contentModerationService.ts';
import { AITutorService } from '../src/services/ai/aiTutorService.ts';
import { generateVisualRepresentation } from '../src/services/visual/visualEngine.ts';

describe('MindMate Frontend Content Safety & Moderation Guard Test Suite', () => {
  describe('1. Content Moderation Evaluation Rules', () => {
    it('blocks explicit adult performer "who is jonny sins"', () => {
      const res = contentModerationService.evaluate('who is jonny sins');
      assert.equal(res.decision, 'BLOCK_EXPLICIT_CONTENT');
      assert.equal(res.isSafeForVisual, false);
      assert.equal(res.isEducational, false);
      assert.equal(res.userExplanation, MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT);
    });

    it('blocks casing and aliases ("Johnny Sins", "John Sins", "Steven Wolfe", "Mia Khalifa")', () => {
      const testCases = ['Johnny Sins', 'john sins', 'johny sins', 'Steven Wolfe', 'Mia Khalifa'];
      for (const tc of testCases) {
        const res = contentModerationService.evaluate(`Who is ${tc}?`);
        assert.equal(res.decision, 'BLOCK_EXPLICIT_CONTENT', `Failed for alias ${tc}`);
        assert.equal(res.isSafeForVisual, false);
      }
    });

    it('blocks leetspeak evasions and de-obfuscates text ("j0hnny s!ns", "p0rn", "b!owjob")', () => {
      const evasions = ['j0hnny s!ns', 'find p0rn videos', 'show me xxx pictures', 'b!owjob'];
      for (const ev of evasions) {
        const res = contentModerationService.evaluate(ev);
        assert.equal(res.decision, 'BLOCK_EXPLICIT_CONTENT', `Failed for evasion ${ev}`);
      }
    });

    it('blocks adult platforms ("pornhub", "xvideos", "onlyfans")', () => {
      const platforms = ['pornhub clips', 'xvideos stream', 'onlyfans leak'];
      for (const p of platforms) {
        const res = contentModerationService.evaluate(p);
        assert.equal(res.decision, 'BLOCK_EXPLICIT_CONTENT', `Failed for platform ${p}`);
      }
    });

    it('inherits blocked decision on follow-up chips ("Explain differently", "Show visually", "Simplify")', () => {
      const followUps = ['Explain differently', 'Show visually', 'Simplify', 'Give example', 'Quiz me'];
      for (const chip of followUps) {
        const res = contentModerationService.evaluate(chip, {
          previousQuestion: 'who is jonny sins',
          previousAnswer: 'Johnny Sins is an adult entertainer.'
        });
        assert.equal(res.decision, 'BLOCK_EXPLICIT_CONTENT', `Failed to inherit context for ${chip}`);
        assert.equal(res.isSafeForVisual, false);
      }
    });

    it('allows legitimate scientific & health education inquiries', () => {
      const validHealthQueries = [
        'How does human fertilization and conception work?',
        'Explain the female reproductive system anatomy and uterus',
        'What changes occur during puberty due to hormones and secondary sex characteristics?',
        'Methods of STI prevention and correct use of condoms',
        'What does healthy relationship consent look like?'
      ];

      for (const q of validHealthQueries) {
        const res = contentModerationService.evaluate(q);
        assert.equal(res.decision, 'ALLOW', `Legitimate health query incorrectly blocked: ${q}`);
        assert.equal(res.isEducational, true);
        assert.equal(res.isSafeForVisual, true);
      }
    });

    it('redirects celebrity gossip and spam politely', () => {
      const gossipRes = contentModerationService.evaluate('Tell me the latest Kardashian drama');
      assert.equal(gossipRes.decision, 'REDIRECT_OFF_TOPIC');
      assert.equal(gossipRes.userExplanation, MODERATION_EXPLANATIONS.REDIRECT_OFF_TOPIC);

      const spamRes = contentModerationService.evaluate('asdfghjklasdfghjkl');
      assert.equal(spamRes.decision, 'REDIRECT_OFF_TOPIC');
    });

    it('allows standard academic and programming topics unconditionally', () => {
      const allowedTopics = [
        'What is a binary search tree?',
        'Explain Python functions and scope',
        'How does photosynthesis work in plants?',
        'Causes of World War 1'
      ];

      for (const t of allowedTopics) {
        const res = contentModerationService.evaluate(t);
        assert.equal(res.decision, 'ALLOW', `Academic query blocked: ${t}`);
      }
    });
  });

  describe('2. AI Tutor Service Moderation in All Modes', () => {
    it('Online Mode: intercepts blocked request and returns refusal with ZERO cloud API calls', async () => {
      const service = new AITutorService();
      service.setMode('online');

      let networkAttempted = false;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        networkAttempted = true;
        throw new Error(`Unexpected network call to ${url} for blocked query!`);
      }) as any;

      try {
        let streamChunk = '';
        const response = await service.sendMessageStream(
          {
            messages: [{ role: 'user', content: 'who is jonny sins' }]
          },
          {
            onChunk: (c) => {
              streamChunk += c;
            }
          }
        );

        assert.equal(networkAttempted, false, 'Pre-flight check must prevent network fetch to Cloud AI');
        assert.equal(response.content, MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT);
        assert.equal(streamChunk, MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Offline Mode: intercepts blocked request without calling WebLLM or network', async () => {
      const service = new AITutorService();
      service.setMode('offline');

      // Even if local model is not loaded, moderation intercepts BEFORE model check
      let streamChunk = '';
      const response = await service.sendMessageStream(
        {
          messages: [{ role: 'user', content: 'who is jonny sins' }]
        },
        {
          onChunk: (c) => {
            streamChunk += c;
          }
        }
      );

      assert.equal(response.content, MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT);
      assert.equal(streamChunk, MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT);
    });

    it('Auto Mode: intercepts blocked request consistently', async () => {
      const service = new AITutorService();
      service.setMode('auto');

      const response = await service.sendMessageStream(
        {
          messages: [{ role: 'user', content: 'who is jonny sins' }]
        },
        {}
      );

      assert.equal(response.content, MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT);
    });

    it('Follow-up "Explain differently" inherits blocked turn in AI Tutor Service', async () => {
      const service = new AITutorService();
      service.setMode('online');

      const response = await service.sendMessageStream(
        {
          messages: [
            { role: 'user', content: 'who is jonny sins' },
            { role: 'assistant', content: MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT },
            { role: 'user', content: 'Explain differently' }
          ]
        },
        {}
      );

      assert.equal(response.content, MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT);
    });
  });

  describe('3. Visual Learning Engine Content Safety Guard', () => {
    it('generateVisualRepresentation refuses adult performer query without querying images', async () => {
      let networkCalled = false;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        networkCalled = true;
        throw new Error(`Unexpected image search fetch to ${url}`);
      }) as any;

      try {
        const visual = await generateVisualRepresentation({
          question: 'who is jonny sins',
          answer: 'Adult personality',
          subject: 'jonny sins',
          mode: 'online',
          isOnline: true
        });

        assert.equal(networkCalled, false, 'Must not query images for adult entity');
        assert.equal(visual.blocked, true);
        assert.equal(visual.format, 'moderation_refusal');
        assert.equal(visual.availableFormats?.length, 0);
        assert.equal(visual.images, undefined);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('generateVisualRepresentation blocks follow-up "Show visually" referencing blocked turn', async () => {
      const visual = await generateVisualRepresentation({
        question: 'Show visually',
        answer: '',
        subject: 'Adult Entertainment',
        mode: 'online',
        isOnline: true,
        previousQuestion: 'who is jonny sins',
        previousAnswer: 'Johnny Sins is an adult performer.'
      });

      assert.equal(visual.blocked, true);
      assert.equal(visual.format, 'moderation_refusal');
      assert.equal(visual.images, undefined);
    });

    it('generateVisualRepresentation permits legitimate academic topics', async () => {
      const visual = await generateVisualRepresentation({
        question: 'How does binary search work?',
        answer: 'Divide and conquer search algorithm',
        subject: 'Binary Search',
        mode: 'online',
        isOnline: true
      });

      assert.equal(visual.blocked, undefined);
      assert.equal(visual.format, 'algorithm_steps');
      assert.ok(visual.algorithm);
    });
  });
});
