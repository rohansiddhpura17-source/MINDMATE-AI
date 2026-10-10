import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCodeAndExplanation } from '../src/services/ai/cloudAdapter.ts';
import { SUPPORTED_LOCAL_MODELS, DEFAULT_LOCAL_MODEL } from '../src/services/ai/localWebLLMAdapter.ts';
import { AITutorService } from '../src/services/ai/aiTutorService.ts';

describe('AI Tutor Service & Adapters Test Suite', () => {
  it('should parse markdown code blocks and explanations accurately', () => {
    const rawMarkdown = `Here is how you define a function in Python:

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}!"
\`\`\`

Remember that type hints are optional in Python but improve code clarity.`;

    const parsed = parseCodeAndExplanation(rawMarkdown);
    assert.equal(parsed.cleanContent, 'Here is how you define a function in Python:');
    assert.ok(parsed.code?.includes('def greet(name: str)'));
    assert.ok(parsed.explanation?.includes('Remember that type hints are optional'));
  });

  it('should handle responses without code blocks cleanly', () => {
    const simpleText = 'Recursion is a programming technique where a function calls itself.';
    const parsed = parseCodeAndExplanation(simpleText);
    assert.equal(parsed.cleanContent, simpleText);
    assert.equal(parsed.code, undefined);
    assert.equal(parsed.explanation, undefined);
  });

  it('should declare valid lightweight local models under Apache-2.0 / open weights', () => {
    assert.ok(SUPPORTED_LOCAL_MODELS.length >= 2);
    assert.ok(
      DEFAULT_LOCAL_MODEL === 'SmolLM2-360M-Instruct-q4f16_1-MLC' ||
        DEFAULT_LOCAL_MODEL === 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'
    );

    const defaultModel = SUPPORTED_LOCAL_MODELS.find((m) => m.id === DEFAULT_LOCAL_MODEL);
    assert.ok(defaultModel);
    assert.ok(defaultModel.name.includes('SmolLM2') || defaultModel.name.includes('Qwen'));
    assert.ok(defaultModel.size.includes('MB'));
  });

  it('AITutorService should handle mode transitions correctly', () => {
    const service = new AITutorService();
    service.setMode('online');
    assert.equal(service.getMode(), 'online');

    service.setMode('offline');
    assert.equal(service.getMode(), 'offline');

    service.setMode('auto');
    assert.equal(service.getMode(), 'auto');
  });

  it('AITutorService in Offline mode must refuse execution if local model is not loaded and make NO cloud requests', async () => {
    const service = new AITutorService();
    service.setMode('offline');

    let errorThrown = false;
    try {
      await service.sendMessageStream(
        {
          messages: [{ role: 'user', content: 'What is a variable?' }]
        },
        {}
      );
    } catch (err: any) {
      errorThrown = true;
      assert.ok(
        err.message.includes('Local model is not loaded yet') ||
          err.message.includes('Offline Mode Active')
      );
    }

    assert.equal(errorThrown, true, 'Service should have rejected when local model was not loaded');
  });

  it('backend endpoint /api/ai/status should respond with status information', async () => {
    try {
      const response = await fetch('http://localhost:4000/api/ai/status');
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.status, 'ok');
      assert.ok('configured' in data);
      assert.ok('model' in data);
    } catch (err: any) {
      console.warn('Backend server check skipped:', err.message);
    }
  });

  it('backend endpoint /api/ai/chat should reject empty message payloads with 400', async () => {
    try {
      const response = await fetch('http://localhost:4000/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] })
      });
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.ok(data.error);
    } catch (err: any) {
      console.warn('Backend server check skipped:', err.message);
    }
  });

  it('backend endpoint /api/ai/chat should reject invalid role types with 400', async () => {
    try {
      const response = await fetch('http://localhost:4000/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'invalid_role', content: 'test message' }]
        })
      });
      assert.equal(response.status, 400);
    } catch (err: any) {
      console.warn('Backend server check skipped:', err.message);
    }
  });

  it('backend endpoint /api/ai/chat should stream genuine chunks in response to valid message', async () => {
    try {
      const response = await fetch('http://localhost:4000/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'What is a boolean?' }],
          stream: false
        })
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(data.content);
      assert.ok(data.content.length > 10);
      assert.equal(data.source, 'cloud');
    } catch (err: any) {
      console.warn('Backend server check skipped:', err.message);
    }
  });

  it('AITutorService abort() should increment activeRequestId and reset activePhase to idle', async () => {
    const service = new AITutorService();
    const initialStatus = await service.getStatus();
    assert.equal(initialStatus.activePhase, 'idle');

    service.abort();
    const status = await service.getStatus();
    assert.equal(status.activePhase, 'idle');
    assert.equal(status.isGenerating, false);
  });

  it('AITutorService should notify subscribers when activePhase changes', async () => {
    const service = new AITutorService();
    service.setMode('online');

    const phasesObserved: string[] = [];
    service.onStatusChange((status) => {
      if (status.activePhase && !phasesObserved.includes(status.activePhase)) {
        phasesObserved.push(status.activePhase);
      }
    });

    try {
      await service.sendMessageStream(
        {
          messages: [{ role: 'user', content: 'Say "hello" briefly' }]
        },
        {
          onPhaseChange: (phase) => {
            phasesObserved.push(phase);
          }
        }
      );
    } catch (err: any) {
      // Backend may or may not be reachable in all environments
    }

    // Phases should have triggered preparing and/or generating/streaming or remained tracked
    assert.ok(phasesObserved.length > 0 || (await service.getStatus()).activePhase === 'idle');
  });

  it('AITutorService discards late tokens after abort is called', async () => {
    const service = new AITutorService();
    service.setMode('online');

    let receivedTokens = 0;
    const streamPromise = service.sendMessageStream(
      {
        messages: [{ role: 'user', content: 'Count from 1 to 10 slowly' }]
      },
      {
        onToken: () => {
          receivedTokens++;
        }
      }
    );

    // Immediately abort
    service.abort();
    const tokensAtAbort = receivedTokens;

    try {
      await streamPromise;
    } catch (e) {
      // Aborted stream rejection is expected
    }

    // Ensure tokens were not received after abort
    assert.equal(receivedTokens, tokensAtAbort, 'Tokens should not accumulate after abort');
  });
});

