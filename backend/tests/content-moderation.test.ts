import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../src/server.js';
import {
  evaluateContentModeration,
  contentModerationService,
  MODERATION_EXPLANATIONS
} from '../src/services/contentModeration.js';
import { searchImages } from '../src/services/imageSearch.js';

describe('MindMate Content Safety & Educational Guard: Service, Adapters & Routes', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('1. Adult Entertainment & Performer Blocking', () => {
    test('blocks direct inquiry about adult performer "who is jonny sins"', () => {
      const result = evaluateContentModeration('who is jonny sins');
      assert.strictEqual(result.decision, 'BLOCK_EXPLICIT_CONTENT');
      assert.strictEqual(result.isSafeForVisual, false);
      assert.strictEqual(result.isEducational, false);
      assert.strictEqual(result.userExplanation, MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT);
      assert.ok(result.flaggedCategories.includes('adult_entertainment_personality'));
    });

    test('blocks spelling variations and aliases ("Johnny Sins", "john sins", "steven wolfe")', () => {
      const aliases = ['Johnny Sins', 'john sins', 'johny sins', 'steven wolfe', 'Mia Khalifa', 'Riley Reid'];
      for (const alias of aliases) {
        const res = evaluateContentModeration(`Tell me about ${alias}`);
        assert.strictEqual(res.decision, 'BLOCK_EXPLICIT_CONTENT', `Failed for alias: ${alias}`);
        assert.strictEqual(res.isSafeForVisual, false);
      }
    });

    test('de-obfuscates and blocks leetspeak evasions ("j0hnny s!ns", "p0rn", "xxx")', () => {
      const evasions = ['j0hnny s!ns', 'tell me about p0rn', 'watch xxx videos', 'b!owjob'];
      for (const query of evasions) {
        const res = evaluateContentModeration(query);
        assert.strictEqual(res.decision, 'BLOCK_EXPLICIT_CONTENT', `Failed for evasion: ${query}`);
        assert.strictEqual(res.isSafeForVisual, false);
      }
    });

    test('blocks adult platforms and tube sites ("pornhub", "xvideos", "onlyfans")', () => {
      const sites = ['pornhub videos', 'xvideos link', 'onlyfans account'];
      for (const site of sites) {
        const res = evaluateContentModeration(site);
        assert.strictEqual(res.decision, 'BLOCK_EXPLICIT_CONTENT', `Failed for site: ${site}`);
      }
    });
  });

  describe('2. Follow-Up Action Context Inheritance', () => {
    test('follow-up "Explain differently" inherits blocked status from preceding question', () => {
      const res = evaluateContentModeration('Explain differently', {
        previousQuestion: 'who is jonny sins',
        previousAnswer: 'Johnny Sins is an adult film actor.'
      });
      assert.strictEqual(res.decision, 'BLOCK_EXPLICIT_CONTENT');
      assert.strictEqual(res.isSafeForVisual, false);
    });

    test('follow-up "Show visually" inherits blocked status from preceding question', () => {
      const res = evaluateContentModeration('Show visually', {
        previousQuestion: 'who is jonny sins',
        previousAnswer: 'Johnny Sins is an adult film actor.'
      });
      assert.strictEqual(res.decision, 'BLOCK_EXPLICIT_CONTENT');
      assert.strictEqual(res.isSafeForVisual, false);
    });

    test('follow-up "Simplify" inherits blocked status from preceding question', () => {
      const res = evaluateContentModeration('Simplify this', {
        previousQuestion: 'who is jonny sins',
        previousAnswer: 'Johnny Sins is an adult film actor.'
      });
      assert.strictEqual(res.decision, 'BLOCK_EXPLICIT_CONTENT');
    });

    test('follow-up "Give example" inherits blocked status from preceding question', () => {
      const res = evaluateContentModeration('Give example', {
        previousQuestion: 'who is jonny sins',
        previousAnswer: 'Johnny Sins is an adult film actor.'
      });
      assert.strictEqual(res.decision, 'BLOCK_EXPLICIT_CONTENT');
    });
  });

  describe('3. Legitimate Biology, Anatomy & Health Education Exemption', () => {
    test('allows legitimate human fertilization inquiry with scientific explanation', () => {
      const res = evaluateContentModeration('How does human fertilization and gametogenesis work in biology?');
      assert.strictEqual(res.decision, 'ALLOW');
      assert.strictEqual(res.isEducational, true);
      assert.strictEqual(res.isSafeForVisual, true);
    });

    test('allows female reproductive system inquiry', () => {
      const res = evaluateContentModeration('Explain the female reproductive system including uterus and ovaries');
      assert.strictEqual(res.decision, 'ALLOW');
      assert.strictEqual(res.isEducational, true);
    });

    test('allows puberty and hormonal changes inquiry', () => {
      const res = evaluateContentModeration('What happens during puberty regarding hormones and secondary sex characteristics?');
      assert.strictEqual(res.decision, 'ALLOW');
      assert.strictEqual(res.isEducational, true);
    });

    test('allows STI prevention and contraception education', () => {
      const res = evaluateContentModeration('What are the medical methods of STI transmission prevention including condoms?');
      assert.strictEqual(res.decision, 'ALLOW');
      assert.strictEqual(res.isEducational, true);
    });

    test('allows healthy relationship consent inquiry', () => {
      const res = evaluateContentModeration('How is mutual consent defined in healthy relationships?');
      assert.strictEqual(res.decision, 'ALLOW');
      assert.strictEqual(res.isEducational, true);
    });
  });

  describe('4. Celebrity Gossip & Spam Polite Redirection', () => {
    test('redirects Kardashian celebrity gossip with educational redirect message', () => {
      const res = evaluateContentModeration('Who is Kardashian dating right now?');
      assert.strictEqual(res.decision, 'REDIRECT_OFF_TOPIC');
      assert.strictEqual(res.userExplanation, MODERATION_EXPLANATIONS.REDIRECT_OFF_TOPIC);
      assert.strictEqual(res.isSafeForVisual, false);
    });

    test('redirects repeated spam gibberish', () => {
      const res = evaluateContentModeration('asdfghjklqwertyuiopasdfghjkl');
      assert.strictEqual(res.decision, 'REDIRECT_OFF_TOPIC');
    });
  });

  describe('5. Dangerous & Harmful Content Blocking', () => {
    test('blocks explosive/bomb creation instructions', () => {
      const res = evaluateContentModeration('how to build a bomb with household chemicals');
      assert.strictEqual(res.decision, 'BLOCK_UNSAFE_REQUEST');
      assert.strictEqual(res.userExplanation, MODERATION_EXPLANATIONS.BLOCK_UNSAFE_REQUEST);
      assert.strictEqual(res.isSafeForVisual, false);
    });
  });

  describe('6. Visual Learning Engine & Image Search Protection', () => {
    test('isVisualSearchPermitted returns false for adult performers', () => {
      assert.strictEqual(contentModerationService.isVisualSearchPermitted('johnny sins'), false);
      assert.strictEqual(contentModerationService.isVisualSearchPermitted('mia khalifa'), false);
      assert.strictEqual(contentModerationService.isVisualSearchPermitted('pornhub'), false);
    });

    test('isVisualSearchPermitted returns true for legitimate educational topics', () => {
      assert.strictEqual(contentModerationService.isVisualSearchPermitted('human heart anatomy'), true);
      assert.strictEqual(contentModerationService.isVisualSearchPermitted('binary search tree'), true);
      assert.strictEqual(contentModerationService.isVisualSearchPermitted('eiffel tower'), true);
    });

    test('searchImages skips Wikimedia query and returns empty results for blocked query', async () => {
      const result = await searchImages('johnny sins', 4);
      assert.strictEqual(result.items.length, 0);
      assert.strictEqual(result.total, 0);
    });

    test('GET /api/visual/images returns blocked: true without querying Wikimedia for blocked query', async () => {
      const res = await fetch(`${baseUrl}/api/visual/images?q=johnny+sins`);
      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.strictEqual(data.blocked, true);
      assert.strictEqual(data.items.length, 0);
      assert.ok(data.message.includes('educational'));
    });
  });

  describe('7. AI Chat Route Pre-flight Moderation Guard', () => {
    test('POST /api/ai/chat immediately blocks adult query without calling LLM', async () => {
      const res = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'who is jonny sins' }],
          stream: false
        })
      });

      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.strictEqual(data.blocked, true);
      assert.strictEqual(data.model, 'content-safety-guard');
      assert.strictEqual(data.content, MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT);
    });

    test('POST /api/ai/chat immediately blocks follow-up request referencing blocked turn', async () => {
      const res = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'who is jonny sins' },
            { role: 'assistant', content: MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT },
            { role: 'user', content: 'Explain differently' }
          ],
          stream: false
        })
      });

      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.strictEqual(data.blocked, true);
      assert.strictEqual(data.content, MODERATION_EXPLANATIONS.BLOCK_EXPLICIT_CONTENT);
    });
  });
});
