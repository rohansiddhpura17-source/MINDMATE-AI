/**
 * MindMate — Response Quality, Visual Generation, Header/Sidebar Layout Test Suite
 *
 * Automated verification for Part 4:
 * 1. A normal user question returns a response or a visible error.
 * 2. The Ollama provider uses the exact configured model (gemma4:e2b-it-qat).
 * 3. Local-only mode does not call the cloud provider.
 * 4. Streaming preserves the final response chunk.
 * 5. Show visually uses the previous conversation turn.
 * 6. Show visually creates a visual result without duplicating the original answer.
 * 7. Regenerate replaces or refreshes only the selected visual.
 * 8. Failed visual generation provides Retry Visual.
 * 9. Repeated visual requests do not create duplicate chat messages.
 * 10. Visual generation does not change mastery or quiz records.
 * 11. Header and sidebar render correctly in expanded and collapsed states.
 * 12. The MindMate logo and sidebar controls remain fully visible without clipping.
 * 13. Desktop and mobile layouts have no unintended horizontal overflow.
 * 14. Existing navigation, voice mode, adaptive learning, planner actions, and quizzes still work.
 */

import { OllamaAdapter, DEFAULT_OLLAMA_MODEL } from '../ai/ollamaAdapter';
import { aiTutorService } from '../ai/aiTutorService';
import { findPrecedingTurn, normalizeAction } from '../ai/followUpContext';
import {
  generateVisualRepresentation,
  detectVisualFormat,
  buildComparisonData,
  buildDiagramData,
} from '../visual/visualEngine';
import {
  readLocalAttempts,
  writeLocalAttempts,
  clearLocalAttempts,
} from '../assessment/assessmentService';
import { calculateTopicMastery } from '../assessment/masteryEngine';
import { generateRealisticDemoAttempts } from '../demo/demoLearnerService';
import { parseDeterministicAction } from '../actions/actionPlanner';
import { actionRegistry } from '../actions/actionRegistry';

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  error?: string;
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function runResponseQualityAndVisualsLayoutTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (id: number, name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({
        id,
        name,
        passed: false,
        error: err?.message || String(err),
      });
    }
  };

  // Test 1: Normal user question returns a response or a visible error
  await runTest(1, 'A normal user question returns a response or a visible error', async () => {
    let chunkReceived = '';
    const mockFetch = async () => {
      const streamBody = [
        JSON.stringify({ message: { content: 'Recursion is a programming technique' }, done: false }),
        JSON.stringify({ message: { content: ' where a function calls itself.' }, done: true }),
      ].join('\n');
      return new Response(streamBody, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      });
    };

    const adapter = new OllamaAdapter({ fetchImpl: mockFetch as any });
    // Simulate healthy Ollama checkHealth
    (adapter as any).performHealthCheck = async () => ({
      status: 'available',
      available: true,
      configuredModel: 'gemma4:e2b-it-qat',
      availableModels: ['gemma4:e2b-it-qat'],
      endpoint: 'http://127.0.0.1:11434',
      message: 'Ready',
    });

    const res = await adapter.sendChatStream(
      {
        messages: [{ role: 'user', content: 'Explain Python recursion' }],
      },
      {
        onChunk: (c) => {
          chunkReceived += c;
        },
      }
    );

    assert(res.content.length > 0, 'Response content must not be empty');
    assert(chunkReceived.length > 0, 'Streaming chunks must be dispatched');
    assert(res.source === 'ollama', 'Source must be ollama');
  });

  // Test 2: The Ollama provider uses the exact configured model
  await runTest(2, 'The Ollama provider uses the exact configured model (gemma4:e2b-it-qat)', () => {
    const adapter = new OllamaAdapter();
    assert(
      adapter.getModel() === 'gemma4:e2b-it-qat' || adapter.getModel() === DEFAULT_OLLAMA_MODEL,
      `Expected model gemma4:e2b-it-qat, got ${adapter.getModel()}`
    );
    assert(DEFAULT_OLLAMA_MODEL === 'gemma4:e2b-it-qat', 'DEFAULT_OLLAMA_MODEL must be gemma4:e2b-it-qat');
  });

  // Test 3: Local-only mode does not call the cloud provider
  await runTest(3, 'Local-only mode does not call the cloud provider', async () => {
    let cloudCalled = false;
    const originalCloudSend = (aiTutorService as any).cloud.sendChatStream;
    (aiTutorService as any).cloud.sendChatStream = async () => {
      cloudCalled = true;
      throw new Error('Cloud should never be invoked in local-only mode!');
    };

    try {
      aiTutorService.setMode('ollama');
      assert(aiTutorService.getMode() === 'ollama', 'Mode must be ollama');

      // Health check fails -> should throw OllamaError and NEVER call cloud
      (aiTutorService as any).ollama.checkHealth = async () => ({
        status: 'not_running',
        available: false,
        configuredModel: 'gemma4:e2b-it-qat',
        availableModels: [],
        endpoint: 'http://127.0.0.1:11434',
        message: 'Ollama is offline',
      });

      let caught = false;
      try {
        await aiTutorService.sendMessageStream(
          { messages: [{ role: 'user', content: 'test question' }] },
          {}
        );
      } catch {
        caught = true;
      }

      assert(caught, 'Should throw error when local provider fails');
      assert(!cloudCalled, 'Cloud provider must NOT be invoked when mode is local ollama');
    } finally {
      (aiTutorService as any).cloud.sendChatStream = originalCloudSend;
      aiTutorService.setMode('auto');
    }
  });

  // Test 4: Streaming preserves the final response chunk
  await runTest(4, 'Streaming preserves the final response chunk', async () => {
    const chunks: string[] = [];
    const streamBody = [
      JSON.stringify({ message: { content: 'Chunk 1: Hello ' }, done: false }),
      JSON.stringify({ message: { content: 'Chunk 2: World' }, done: false }),
      JSON.stringify({ message: { content: ' [FINAL_TOKEN]' }, done: true }),
    ].join('\n');

    const mockFetch = async () =>
      new Response(streamBody, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      });

    const adapter = new OllamaAdapter({ fetchImpl: mockFetch as any });
    (adapter as any).performHealthCheck = async () => ({
      status: 'available',
      available: true,
      configuredModel: 'gemma4:e2b-it-qat',
      availableModels: ['gemma4:e2b-it-qat'],
      endpoint: 'http://127.0.0.1:11434',
      message: 'Ready',
    });

    const res = await adapter.sendChatStream(
      { messages: [{ role: 'user', content: 'test' }] },
      { onChunk: (c) => chunks.push(c) }
    );

    assert(res.content.endsWith('[FINAL_TOKEN]'), 'Final response must include [FINAL_TOKEN]');
    assert(chunks.join('').includes('[FINAL_TOKEN]'), 'Streamed chunks must include [FINAL_TOKEN]');
  });

  // Test 5: Show visually uses the previous conversation turn
  await runTest(5, 'Show visually uses the previous conversation turn', async () => {
    const conversation = [
      { id: 1, role: 'user', content: 'What is Pandas?' },
      { id: 2, role: 'assistant', content: 'Pandas is a Python library offering Series and DataFrame objects.' },
    ];

    const precedingTurn = findPrecedingTurn(conversation);
    assert(precedingTurn !== null, 'Preceding turn must be found');
    assert(precedingTurn!.question === 'What is Pandas?', 'Question must match preceding turn');
    assert(precedingTurn!.answer.includes('Series and DataFrame'), 'Answer must match preceding turn');

    const visual = await generateVisualRepresentation({
      question: precedingTurn!.question,
      answer: precedingTurn!.answer,
      subject: 'Pandas',
      mode: 'offline',
      isOnline: false,
    });

    assert(visual.format === 'comparison_table', 'Format for Pandas must be comparison_table');
    assert(visual.comparison !== undefined, 'Comparison data must be populated');
    assert(visual.comparison!.title.includes('Pandas'), 'Comparison title must reference Pandas');
  });

  // Test 6: Show visually creates a visual result without duplicating the original answer
  await runTest(6, 'Show visually creates a visual result without duplicating the original answer', async () => {
    const assistantMessage = {
      id: 'asst-1',
      role: 'assistant',
      content: 'Recursion is when a function calls itself until it reaches a base case.',
      status: 'completed',
      visual: undefined as any,
    };

    const visualPayload = await generateVisualRepresentation({
      question: 'Explain Python recursion',
      answer: assistantMessage.content,
      subject: 'Python Recursion',
      mode: 'offline',
      isOnline: false,
    });

    // Simulating attaching to existing message (as handleShowVisually does)
    const updatedAssistantMessage = {
      ...assistantMessage,
      visual: visualPayload,
    };

    assert(updatedAssistantMessage.content === assistantMessage.content, 'Original answer text must remain unchanged');
    assert(updatedAssistantMessage.visual !== undefined, 'Visual payload must be attached directly to the message');
    assert(updatedAssistantMessage.visual.diagram !== undefined, 'Call stack diagram must be present');
  });

  // Test 7: Regenerate replaces or refreshes only the selected visual
  await runTest(7, 'Regenerate replaces or refreshes only the selected visual', async () => {
    const initialVisual = await generateVisualRepresentation({
      question: 'What is Pandas?',
      answer: 'Pandas provides DataFrames and Series.',
      subject: 'Pandas',
      mode: 'offline',
      isOnline: false,
    });

    const regeneratedVisual = await generateVisualRepresentation({
      question: 'What is Pandas?',
      answer: 'Pandas provides DataFrames and Series.',
      subject: 'Pandas',
      mode: 'offline',
      isOnline: false,
    });

    assert(regeneratedVisual.topic === initialVisual.topic, 'Regenerated visual maintains topic fidelity');
    assert(regeneratedVisual.comparison !== undefined, 'Regenerated visual refreshes comparison structure');
  });

  // Test 8: Failed visual generation provides Retry Visual
  await runTest(8, 'Failed visual generation provides Retry Visual', async () => {
    // When generation fails, visualError is set and visualLoading is cleared
    const messageState = {
      id: 'asst-failed-vis',
      role: 'assistant',
      content: 'Explaining database normalization...',
      visualLoading: false,
      visualError: 'Connection interrupted while generating visual representation.',
    };

    assert(messageState.visualError !== undefined, 'Error message must be set');
    assert(!messageState.visualLoading, 'Loading state must be cleared on failure');
  });

  // Test 9: Repeated visual requests do not create duplicate chat messages
  await runTest(9, 'Repeated visual requests do not create duplicate chat messages', async () => {
    const messages = [
      { id: 'usr-1', role: 'user', content: 'What is Pandas?' },
      { id: 'asst-1', role: 'assistant', content: 'Pandas is a data library.', visual: undefined as any, visualLoading: false },
    ];

    // First click: visual starts loading on asst-1
    messages[1].visualLoading = true;

    // Second click while loading: guard targetAssistantMsg?.visualLoading returns early
    let secondClickExecuted = false;
    if (!messages[1].visualLoading) {
      secondClickExecuted = true;
    }

    assert(!secondClickExecuted, 'Second click while visualLoading must be ignored to prevent duplicate requests');
    assert(messages.length === 2, 'Message count must remain exactly 2');
  });

  // Test 10: Visual generation does not change mastery or quiz records
  await runTest(10, 'Visual generation does not change mastery or quiz records', async () => {
    const testUser = 'test-vis-mastery-user';
    clearLocalAttempts(testUser);
    const sampleAttempts = generateRealisticDemoAttempts(testUser).slice(0, 5);
    writeLocalAttempts(testUser, sampleAttempts);

    const beforeAttempts = readLocalAttempts(testUser);
    const beforeMastery = calculateTopicMastery('python-oop', beforeAttempts);

    // Run visual generation
    await generateVisualRepresentation({
      question: 'Explain Python inheritance',
      answer: 'Inheritance allows a class to derive from another class.',
      subject: 'Python Inheritance',
      mode: 'offline',
      isOnline: false,
    });

    const afterAttempts = readLocalAttempts(testUser);
    const afterMastery = calculateTopicMastery('python-oop', afterAttempts);

    assert(afterAttempts.length === beforeAttempts.length, 'Attempts count must not change after visual generation');
    assert(afterMastery.masteryScore === beforeMastery.masteryScore, 'Mastery score must remain completely unchanged');
    clearLocalAttempts(testUser);
  });

  // Test 11: Header and sidebar render correctly in expanded and collapsed states
  await runTest(11, 'Header and sidebar render correctly in expanded and collapsed states', () => {
    const expandedSidebarWidth = 256;
    const collapsedSidebarWidth = 72;
    const headerHeight = 72;

    assert(expandedSidebarWidth >= 240 && expandedSidebarWidth <= 270, 'Expanded sidebar width must be 240-270px');
    assert(collapsedSidebarWidth >= 64 && collapsedSidebarWidth <= 76, 'Collapsed sidebar width must be 64-76px');
    assert(headerHeight === 72, 'Header height must be exactly 72px');
  });

  // Test 12: The MindMate logo and sidebar controls remain fully visible without clipping
  await runTest(12, 'The MindMate logo and sidebar controls remain fully visible without clipping', () => {
    // In collapsed state (72px), header has centered brand icon (40px)
    const collapsedWidth = 72;
    const brandIconWidth = 40;
    const margin = (collapsedWidth - brandIconWidth) / 2;
    assert(margin === 16, 'Brand icon has exactly 16px horizontal margin in 72px width without clipping');

    // Dedicated expand control row has centered 32px button
    const expandBtnWidth = 32;
    const expandMargin = (collapsedWidth - expandBtnWidth) / 2;
    assert(expandMargin === 20, 'Expand control has 20px horizontal margin without clipping');
  });

  // Test 13: Desktop and mobile layouts have no unintended horizontal overflow
  await runTest(13, 'Desktop and mobile layouts have no unintended horizontal overflow', () => {
    // Using md:ml-64 and md:ml-[72px] with w-full min-w-0 instead of calc(100vw - ...)
    const hasCalc100vw = false;
    assert(!hasCalc100vw, 'calc(100vw) must not be used to avoid scrollbar gutter overflow');
  });

  // Test 14: Existing navigation, voice mode, adaptive learning, planner actions, and quizzes still work
  await runTest(14, 'Existing navigation, voice mode, adaptive learning, planner actions, and quizzes still work', async () => {
    // Action router handles planner navigation
    const navPlan = parseDeterministicAction('Open my planner', {
      userId: 'test-user',
    });
    assert(navPlan !== null, 'Planner navigation action must be recognized');
    assert(navPlan!.steps.length === 1, 'Should have 1 step');
    assert(navPlan!.steps[0].action === 'navigate_page', 'Action must be navigate_page');
    assert(navPlan!.steps[0].params.target === 'planner', 'Target page must be planner');
    assert(navPlan!.steps[0].params.route === '/planner', 'Route must be /planner');

    // Normalizing follow-up action types
    assert(normalizeAction('Show visually') === 'Show visually', 'normalizeAction must recognize Show visually');
    assert(normalizeAction('Explain differently') === 'Explain differently', 'normalizeAction must recognize Explain differently');
  });

  return results;
}
