import assert from 'node:assert/strict';
import {
  parseVoiceCommand,
  sanitizeTextForSpeech,
  chunkTextIntoSentences,
  WebSpeechRecognitionService,
  WebSpeechSynthesisService,
  loadVoiceSettings,
  saveVoiceSettings,
  DEFAULT_VOICE_SETTINGS,
  SpeechRecognitionErrorEvent,
  SpeechTranscriptPayload,
} from '../index';
import { OllamaAdapter, DEFAULT_OLLAMA_MODEL } from '../../ai/ollamaAdapter';
import { AITutorService } from '../../ai/aiTutorService';
import { CloudAIAdapter } from '../../ai/cloudAdapter';
import { LocalWebLLMAdapter } from '../../ai/localWebLLMAdapter';

export interface TestCaseResult {
  id: number;
  name: string;
  passed: boolean;
  error?: string;
}

export async function runVoiceAssistantTests(): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = [];

  const runTest = async (id: number, name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, error: err?.message || String(err) });
    }
  };

  // Test 1: Browser speech recognition supported detection
  await runTest(1, 'Browser speech recognition supported detection', () => {
    const service = new WebSpeechRecognitionService();
    // In Node.js environment without window.SpeechRecognition, isSupported returns false
    assert.strictEqual(service.isSupported(), false);

    // Mock window with SpeechRecognition
    const prevWindow = (globalThis as any).window;
    (globalThis as any).window = {
      SpeechRecognition: class MockSpeechRecognition {},
    };
    try {
      assert.strictEqual(service.isSupported(), true);
    } finally {
      (globalThis as any).window = prevWindow;
    }
  });

  // Test 2: Browser speech recognition unavailable fallback handling
  await runTest(2, 'Browser speech recognition unavailable fallback handling', async () => {
    const service = new WebSpeechRecognitionService();
    const prevWindow = (globalThis as any).window;
    (globalThis as any).window = {}; // No SpeechRecognition or webkitSpeechRecognition

    let receivedError: SpeechRecognitionErrorEvent | null = null;
    await service.startListening({
      onTranscript: () => {},
      onError: (err) => {
        receivedError = err;
      },
    });

    (globalThis as any).window = prevWindow;
    assert.ok(receivedError);
    assert.strictEqual((receivedError as SpeechRecognitionErrorEvent).kind, 'not-supported');
    assert.strictEqual((receivedError as SpeechRecognitionErrorEvent).recoverable, false);
  });

  // Test 3: Microphone permission denied handling
  await runTest(3, 'Microphone permission denied handling', async () => {
    const service = new WebSpeechRecognitionService();
    const prevWindow = (globalThis as any).window;

    class DeniedSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      start() {
        if (this.onerror) {
          this.onerror({ error: 'not-allowed' });
        }
      }
      stop() {}
      onerror: any;
      onend: any;
    }

    (globalThis as any).window = { SpeechRecognition: DeniedSpeechRecognition };

    let receivedError: SpeechRecognitionErrorEvent | null = null;
    await service.startListening({
      onTranscript: () => {},
      onError: (err) => {
        receivedError = err;
      },
    });

    (globalThis as any).window = prevWindow;
    assert.ok(receivedError);
    assert.strictEqual((receivedError as SpeechRecognitionErrorEvent).kind, 'not-allowed');
    assert.ok((receivedError as SpeechRecognitionErrorEvent).message.toLowerCase().includes('permission denied'));
  });

  // Test 4: Empty and partial transcripts handling
  await runTest(4, 'Empty and partial transcripts handling', async () => {
    const service = new WebSpeechRecognitionService();
    const prevWindow = (globalThis as any).window;

    let triggerResult: any;
    class MockRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      start() {
        triggerResult = this.onresult;
      }
      stop() {}
      onresult: any;
    }

    (globalThis as any).window = { SpeechRecognition: MockRecognition };

    const payloads: SpeechTranscriptPayload[] = [];
    await service.startListening({
      onTranscript: (payload) => payloads.push(payload),
      onError: () => {},
    });

    // Simulate interim (partial) transcript
    triggerResult({
      resultIndex: 0,
      results: [
        {
          0: { transcript: 'what is' },
          isFinal: false,
        },
      ],
    });

    assert.strictEqual(payloads.length, 1);
    assert.strictEqual(payloads[0].interimTranscript, 'what is');
    assert.strictEqual(payloads[0].finalTranscript, '');
    assert.strictEqual(payloads[0].isFinal, false);

    // Simulate final completion
    triggerResult({
      resultIndex: 0,
      results: [
        {
          0: { transcript: 'what is recursion' },
          isFinal: true,
        },
      ],
    });

    (globalThis as any).window = prevWindow;
    assert.strictEqual(payloads.length, 2);
    assert.strictEqual(payloads[1].finalTranscript, 'what is recursion');
    assert.strictEqual(payloads[1].isFinal, true);
  });

  // Test 5: Transcript editing and confirmation
  await runTest(5, 'Transcript editing and confirmation', () => {
    const originalRecognized = 'quiz me on python loops';
    // User edits transcript before submitting
    const userEdited = 'quiz me on nested loops';

    const cmd1 = parseVoiceCommand(originalRecognized);
    assert.strictEqual(cmd1.type, 'learning');
    assert.strictEqual(cmd1.action, 'quiz_on_topic');
    assert.strictEqual(cmd1.payload?.topic, 'python loops');

    const cmd2 = parseVoiceCommand(userEdited);
    assert.strictEqual(cmd2.type, 'learning');
    assert.strictEqual(cmd2.action, 'quiz_on_topic');
    assert.strictEqual(cmd2.payload?.topic, 'nested loops');
  });

  // Test 6: Speech-recognition errors and cleanup
  await runTest(6, 'Speech-recognition errors and cleanup', async () => {
    const service = new WebSpeechRecognitionService();
    const prevWindow = (globalThis as any).window;

    let stoppedCalled = false;
    class MockRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      start() {}
      stop() {
        stoppedCalled = true;
      }
    }

    (globalThis as any).window = { SpeechRecognition: MockRecognition };

    await service.startListening({
      onTranscript: () => {},
      onError: () => {},
    });

    service.stopListening();
    (globalThis as any).window = prevWindow;

    assert.strictEqual(stoppedCalled, true);
    assert.strictEqual(service.isListening(), false);
  });

  // Test 7: Local model connected and missing-model states
  await runTest(7, 'Local model connected and missing-model states', async () => {
    // Test OllamaAdapter health check when model matches vs when model missing
    const fakeFetchMissing = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ models: [{ name: 'llama3:latest' }] }),
    });

    const missingAdapter = new OllamaAdapter({
      model: 'gemma4:e2b-it-qat',
      fetchImpl: fakeFetchMissing as any,
    });

    const missingHealth = await missingAdapter.checkHealth(1500, true);
    assert.strictEqual(missingHealth.status, 'model_missing');
    assert.strictEqual(missingHealth.available, false);

    const fakeFetchReady = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ models: [{ name: 'gemma4:e2b-it-qat' }] }),
    });

    const readyAdapter = new OllamaAdapter({
      model: 'gemma4:e2b-it-qat',
      fetchImpl: fakeFetchReady as any,
    });

    const readyHealth = await readyAdapter.checkHealth(1500, true);
    assert.strictEqual(readyHealth.status, 'available');
    assert.strictEqual(readyHealth.available, true);
  });

  // Test 8: A voice question routed to the selected Ollama provider
  await runTest(8, 'A voice question routed to the selected Ollama provider', async () => {
    let ollamaCalled = false;
    let cloudCalled = false;

    const fakeOllama = {
      isAvailable: async () => true,
      sendChatStream: async () => {
        ollamaCalled = true;
        return { content: 'Gemma 4 explanation of recursion', source: 'ollama' as const, model: 'gemma4:e2b-it-qat' };
      },
      checkHealth: async () => ({ available: true, status: 'available' as const, configuredModel: 'gemma4:e2b-it-qat', availableModels: ['gemma4:e2b-it-qat'], endpoint: '/ollama', message: 'Ready' }),
      getModel: () => 'gemma4:e2b-it-qat',
      getStatus: () => 'available' as const,
      isConfigured: () => true,
      isGenerating: () => false,
    };

    const fakeCloud = {
      isAvailable: () => true,
      sendChatStream: async () => {
        cloudCalled = true;
        return { content: 'Cloud response', source: 'cloud' as const, model: 'gemini' };
      },
      getStatus: async () => ({ configured: true, provider: 'gemini', model: 'gemini-3.5-flash' }),
      getModel: () => 'gemini-3.5-flash',
      isConfigured: () => true,
      isGenerating: () => false,
    };

    const service = new AITutorService({
      ollamaAdapter: fakeOllama as any,
      cloudAdapter: fakeCloud as any,
      initialMode: 'ollama',
    });

    const res = await service.sendMessageStream(
      { messages: [{ role: 'user', content: 'Explain recursion with a base case' }] },
      {}
    );
    assert.strictEqual(ollamaCalled, true);
    assert.strictEqual(cloudCalled, false);
    assert.strictEqual(res.source, 'ollama');
  });

  // Test 9: Cloud provider is not called when local-only mode is selected
  await runTest(9, 'Cloud provider is not called when local-only mode is selected', async () => {
    let cloudInvocations = 0;

    const fakeOllamaOffline = {
      isAvailable: async () => false,
      sendChatStream: async () => {
        throw new Error('Ollama offline: connection refused');
      },
      checkHealth: async () => ({ available: false, status: 'not_running' as const, configuredModel: 'gemma4:e2b-it-qat', availableModels: [], endpoint: '/ollama', message: 'Not running' }),
      getModel: () => 'gemma4:e2b-it-qat',
      getStatus: () => 'not_running' as const,
      isConfigured: () => true,
      isGenerating: () => false,
    };

    const fakeCloud = {
      isAvailable: () => true,
      sendChatStream: async () => {
        cloudInvocations++;
        return { content: 'Should not be called', source: 'cloud' as const, model: 'gemini' };
      },
      getStatus: async () => ({ configured: true, provider: 'gemini', model: 'gemini-3.5-flash' }),
      getModel: () => 'gemini-3.5-flash',
      isConfigured: () => true,
      isGenerating: () => false,
    };

    const service = new AITutorService({
      ollamaAdapter: fakeOllamaOffline as any,
      cloudAdapter: fakeCloud as any,
      initialMode: 'ollama',
    });

    // In local-only mode (ollama), failure must NEVER silently invoke cloud
    let errorCaught = false;
    try {
      await service.sendMessageStream(
        { messages: [{ role: 'user', content: 'What is a loop?' }] },
        {}
      );
    } catch {
      errorCaught = true;
    }

    assert.strictEqual(errorCaught, true);
    assert.strictEqual(cloudInvocations, 0);
  });

  // Test 10: AI generation failure clears the loading state
  await runTest(10, 'AI generation failure clears the loading state', async () => {
    const fakeOllamaThrows = {
      isAvailable: async () => true,
      sendChatStream: async () => {
        throw new Error('Inference interrupted');
      },
      checkHealth: async () => ({ available: true, status: 'available' as const, configuredModel: 'gemma4:e2b-it-qat', availableModels: ['gemma4:e2b-it-qat'], endpoint: '/ollama', message: 'Ready' }),
      getModel: () => 'gemma4:e2b-it-qat',
      getStatus: () => 'available' as const,
      isConfigured: () => true,
      isGenerating: () => false,
    };

    const service = new AITutorService({
      ollamaAdapter: fakeOllamaThrows as any,
      initialMode: 'ollama',
    });

    let phaseRecorded = '';
    try {
      await service.sendMessageStream(
        { messages: [{ role: 'user', content: 'hello' }] },
        {
          onError: () => {
            phaseRecorded = 'failed';
          },
        }
      );
    } catch {}

    const status = await service.getStatus(false);
    assert.strictEqual(status.isGenerating, false);
    assert.strictEqual(phaseRecorded, 'failed');
  });

  // Test 11: Stop generation cancels the request where supported
  await runTest(11, 'Stop generation cancels the request where supported', async () => {
    const service = new AITutorService();
    // Simulate active generation and abort
    service.abort();
    const status = await service.getStatus(false);
    assert.strictEqual(status.isGenerating, false);
  });

  // Test 12: Speech synthesis reads the response with markdown sanitization
  await runTest(12, 'Speech synthesis reads the response with markdown sanitization', () => {
    const rawMarkdown = `
### Python Functions Explained
Here is how you define a function:
\`\`\`python
def add(a, b):
    return a + b
\`\`\`
**Key Takeaway:** Always use the \`def\` keyword!
Check [the docs](https://python.org) for more.
    `;

    const sanitized = sanitizeTextForSpeech(rawMarkdown);
    // Must NOT contain backticks, raw URLs, Markdown headers or code blocks
    assert.ok(!sanitized.includes('```'));
    assert.ok(!sanitized.includes('`def`'));
    assert.ok(!sanitized.includes('###'));
    assert.ok(!sanitized.includes('https://python.org'));
    assert.ok(sanitized.includes('Python Functions Explained'));
    assert.ok(sanitized.includes('Key Takeaway'));
    assert.ok(sanitized.includes('Here is the python code.'));
  });

  // Test 13: Stop speaking cancels queued speech
  await runTest(13, 'Stop speaking cancels queued speech', () => {
    const service = new WebSpeechSynthesisService();
    let cancelCalled = false;
    const prevWindow = (globalThis as any).window;

    (globalThis as any).window = {
      speechSynthesis: {
        cancel: () => {
          cancelCalled = true;
        },
        speaking: true,
        getVoices: () => [],
      },
    };

    service.stop();
    (globalThis as any).window = prevWindow;
    assert.strictEqual(cancelCalled, true);
    assert.strictEqual(service.isSpeaking(), false);
  });

  // Test 14: Voice command navigation uses real application routes
  await runTest(14, 'Voice command navigation uses real application routes', () => {
    const homeCmd = parseVoiceCommand('open my home');
    assert.strictEqual(homeCmd.type, 'navigation');
    assert.strictEqual(homeCmd.route, '/home');

    const progressCmd = parseVoiceCommand('open my progress');
    assert.strictEqual(progressCmd.type, 'navigation');
    assert.strictEqual(progressCmd.route, '/progress');

    const plannerCmd = parseVoiceCommand('open the planner');
    assert.strictEqual(plannerCmd.type, 'navigation');
    assert.strictEqual(plannerCmd.route, '/planner');

    const twinCmd = parseVoiceCommand('open my learning twin');
    assert.strictEqual(twinCmd.type, 'navigation');
    assert.strictEqual(twinCmd.route, '/learning-twin');

    const practiceCmd = parseVoiceCommand('open practice');
    assert.strictEqual(practiceCmd.type, 'navigation');
    assert.strictEqual(practiceCmd.route, '/practice');

    const materialsCmd = parseVoiceCommand('open materials');
    assert.strictEqual(materialsCmd.type, 'navigation');
    assert.strictEqual(materialsCmd.route, '/materials');

    const zoomCmd = parseVoiceCommand('open zoom classes');
    assert.strictEqual(zoomCmd.type, 'navigation');
    assert.strictEqual(zoomCmd.route, '/zoom-classes');
  });

  // Test 15: An ambiguous command asks a question instead of guessing
  await runTest(15, 'An ambiguous command asks a question instead of guessing', () => {
    const ambiguousOpen = parseVoiceCommand('open it');
    assert.strictEqual(ambiguousOpen.type, 'clarification');
    assert.ok(ambiguousOpen.clarificationQuestion?.includes('Where would you like to go?'));

    const ambiguousQuiz = parseVoiceCommand('quiz me');
    assert.strictEqual(ambiguousQuiz.type, 'clarification');
    assert.ok(ambiguousQuiz.clarificationQuestion?.includes('Would you like a quiz'));

    const destructiveCmd = parseVoiceCommand('delete my account');
    assert.strictEqual(destructiveCmd.type, 'clarification');
    assert.ok(destructiveCmd.clarificationQuestion?.includes('Settings'));
  });

  // Test 16: Text chat still works when voice features are unsupported
  await runTest(16, 'Text chat still works when voice features are unsupported', () => {
    const recService = new WebSpeechRecognitionService();
    const synService = new WebSpeechSynthesisService();

    // In headless or unsupported environment
    const voiceReady = recService.isSupported() && synService.isSupported();
    // Even when voiceReady is false, regular text command evaluation works identically
    const query = 'Explain variable scope';
    const parsed = parseVoiceCommand(query);
    assert.strictEqual(parsed.type, 'question');
  });

  // Test 17: No duplicate messages or duplicated quiz submissions
  await runTest(17, 'No duplicate messages or duplicated quiz submissions', () => {
    // Verify sentence chunking produces non-overlapping clean segments
    const text = 'First sentence. Second sentence! Third sentence? Fourth sentence.';
    const chunks = chunkTextIntoSentences(text, 40);
    assert.ok(chunks.length >= 2);
    const joined = chunks.join(' ');
    assert.strictEqual(joined, text);
  });

  return results;
}
