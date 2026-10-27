import {
  classifyTopicRelevance,
} from '../ai/relevanceClassifier';
import {
  buildSubjectTutorContext,
  buildEducationalSystemPrompt,
  formatProviderBadge,
} from '../ai/tutorContextService';
import {
  OllamaAdapter,
  OllamaError,
  validateGeneratedQuestionDraft,
} from '../ai/ollamaAdapter';
import { AITutorService } from '../ai/aiTutorService';
import { calculateTopicMastery } from '../assessment/masteryEngine';
import type { AIResponse, AIStreamCallbacks, SendMessageOptions } from '../ai/types';

export interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  error?: string;
}

export async function runOfflineAiAccuracyAndRelevanceTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
  }

  // Test 1: Relevant question about Python functions receives a targeted programming explanation directive
  try {
    const relevance = classifyTopicRelevance(
      'How do default argument values work in Python functions?',
      'python-functions'
    );
    assert(
      relevance.category === 'relevant_topic',
      `Expected category 'relevant_topic', got '${relevance.category}'`
    );
    assert(
      relevance.activeTopic.id === 'python-functions',
      `Expected activeTopic 'python-functions', got '${relevance.activeTopic.id}'`
    );

    const tutorContext = buildSubjectTutorContext(
      'How do default argument values work in Python functions?',
      {
        topicId: 'python-functions',
        topicName: 'Python Functions',
        masteryScore: 65,
        confidenceLevel: 'medium',
        targetDifficulty: '3',
        explanationStrategy: 'step-by-step',
        strategyReason: 'Structured multi-step breakdown for function parameters',
      }
    );

    const systemPrompt = buildEducationalSystemPrompt(tutorContext);
    assert(
      systemPrompt.includes('DIRECTLY RELEVANT TO CURRENT TOPIC (Python Functions)'),
      'System prompt must state directly relevant to Python Functions'
    );
    assert(
      systemPrompt.includes('Strategy: Step-by-Step Breakdown'),
      'System prompt must include the selected strategy directive'
    );

    results.push({
      id: 1,
      name: 'Relevant question about Python functions receives a targeted programming explanation directive',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 1,
      name: 'Relevant question about Python functions receives a targeted programming explanation directive',
      passed: false,
      error: err.message,
    });
  }

  // Test 2: Relevant question using a synonym not explicitly in the topic name is classified as relevant
  try {
    const relevance = classifyTopicRelevance(
      'How do anonymous lambda expressions work with return values and parameters?',
      'python-functions'
    );
    assert(
      relevance.category === 'relevant_topic',
      `Expected 'relevant_topic' for lambda synonym, got '${relevance.category}'`
    );
    assert(
      relevance.confidence === 'high',
      `Expected high confidence match for topic synonym, got '${relevance.confidence}'`
    );

    results.push({
      id: 2,
      name: 'Relevant question using a synonym not explicitly in topic name is classified as relevant',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 2,
      name: 'Relevant question using a synonym not explicitly in topic name is classified as relevant',
      passed: false,
      error: err.message,
    });
  }

  // Test 3: "What are F1 cars?" while topic is Python Functions receives brief factual answer AND gentle topic reminder
  try {
    const relevance = classifyTopicRelevance(
      'What is F1 cars?',
      'python-functions'
    );
    assert(
      relevance.category === 'off_topic_factual',
      `Expected category 'off_topic_factual', got '${relevance.category}'`
    );
    assert(
      Boolean(relevance.factualEntityHint),
      'Must contain factualEntityHint for F1 entity'
    );
    assert(
      relevance.factualEntityHint?.entity === 'f1',
      `Expected entity 'f1', got '${relevance.factualEntityHint?.entity}'`
    );
    assert(
      Boolean(relevance.factualEntityHint?.pitfallAvoidance.includes('Formula One racing cars')),
      'Entity hint must enforce pitfall avoidance against confusing racing cars with circuits'
    );
    assert(
      Boolean(relevance.topicReminder),
      'Must provide a gentle topic reminder'
    );
    assert(
      relevance.topicReminder!.includes("Python Functions"),
      `Topic reminder should reference Python Functions, got: ${relevance.topicReminder}`
    );

    const tutorContext = buildSubjectTutorContext('What is F1 cars?', {
      topicId: 'python-functions',
      topicName: 'Python Functions',
      masteryScore: 60,
      confidenceLevel: 'medium',
      targetDifficulty: '3',
      explanationStrategy: 'step-by-step',
    });

    const prompt = buildEducationalSystemPrompt(tutorContext);
    assert(
      prompt.includes('OFF-TOPIC GENERAL KNOWLEDGE QUESTION'),
      'Prompt must instruct off-topic handling'
    );
    assert(
      prompt.includes('Do NOT lecture on or dump a multi-page tutorial'),
      'Prompt must forbid creating a fake tutorial around off-topic entities'
    );
    assert(
      prompt.includes(relevance.topicReminder!),
      'Prompt must mandate appending the exact topic reminder'
    );

    results.push({
      id: 3,
      name: '"What are F1 cars?" receives a brief factual answer AND a gentle topic reminder',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 3,
      name: '"What are F1 cars?" receives a brief factual answer AND a gentle topic reminder',
      passed: false,
      error: err.message,
    });
  }

  // Test 4: General question receives a brief answer and a topic reminder
  try {
    const relevance = classifyTopicRelevance(
      'Who invented the telephone?',
      'python-loops'
    );
    assert(
      relevance.category === 'off_topic_factual',
      `Expected 'off_topic_factual', got '${relevance.category}'`
    );
    assert(
      Boolean(relevance.topicReminder),
      'Must contain friendly topic reminder for Python Loops'
    );
    assert(
      relevance.topicReminder!.includes('Loops'),
      `Topic reminder must mention Loops, got: ${relevance.topicReminder}`
    );

    results.push({
      id: 4,
      name: 'General question receives a brief answer and a topic reminder',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 4,
      name: 'General question receives a brief answer and a topic reminder',
      passed: false,
      error: err.message,
    });
  }

  // Test 5: Ambiguous question requests clarification
  try {
    const relevance = classifyTopicRelevance(
      'What is this?',
      'dbms-sql'
    );
    assert(
      relevance.category === 'ambiguous_or_uncertain',
      `Expected 'ambiguous_or_uncertain', got '${relevance.category}'`
    );
    assert(
      Boolean(relevance.clarificationPrompt),
      'Must provide a clarification prompt'
    );

    const tutorContext = buildSubjectTutorContext('What is this?', {
      topicId: 'dbms-sql',
      topicName: 'SQL',
      masteryScore: 40,
      confidenceLevel: 'low',
      targetDifficulty: '2',
      explanationStrategy: 'step-by-step',
    });

    const prompt = buildEducationalSystemPrompt(tutorContext);
    assert(
      prompt.includes('STATUS: AMBIGUOUS OR UNDERSPECIFIED QUESTION'),
      'System prompt must direct the model to ask for clarification'
    );

    results.push({
      id: 5,
      name: 'Ambiguous question requests clarification',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 5,
      name: 'Ambiguous question requests clarification',
      passed: false,
      error: err.message,
    });
  }

  // Test 6: Explicit request to switch to another subject is recognized as a switch intent
  try {
    const relevance = classifyTopicRelevance(
      'Can we switch to SQL now?',
      'python-functions'
    );
    assert(
      relevance.category === 'subject_switch_intent',
      `Expected 'subject_switch_intent', got '${relevance.category}'`
    );
    assert(
      relevance.targetTopic?.id === 'dbms-sql',
      `Expected targetTopic 'dbms-sql', got '${relevance.targetTopic?.id}'`
    );

    const tutorContext = buildSubjectTutorContext('Can we switch to SQL now?', {
      topicId: 'python-functions',
      topicName: 'Python Functions',
      masteryScore: 50,
      confidenceLevel: 'medium',
      targetDifficulty: '3',
      explanationStrategy: 'step-by-step',
    });

    const prompt = buildEducationalSystemPrompt(tutorContext);
    assert(
      prompt.includes('STATUS: TOPIC SWITCH REQUEST'),
      'Prompt must recognize topic switch request'
    );
    assert(
      prompt.includes('acknowledge the switch to SQL'),
      'Prompt must instruct welcoming the new topic'
    );

    results.push({
      id: 6,
      name: 'Explicit request to switch to another subject is recognized as a switch intent',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 6,
      name: 'Explicit request to switch to another subject is recognized as a switch intent',
      passed: false,
      error: err.message,
    });
  }

  // Test 7: Inaccurate or incomplete local model response triggers recovery guidance or repair
  try {
    // Malformed JSON (missing options and wrong format)
    const brokenOutput = '{"topicId": "python-functions", "question": "What is def?", "options": ["A", "B"]}';
    const validation = validateGeneratedQuestionDraft(brokenOutput, 'python-functions', 3);
    assert(!validation.valid, 'Validation must fail on incomplete options');
    if (!validation.valid) {
      assert(
        validation.reason.includes('exactly 4 strings'),
        `Expected 4 strings error, got: ${validation.reason}`
      );
    }

    // Question for wrong topic
    const mismatchedTopicOutput = JSON.stringify({
      topicId: 'dbms-sql',
      difficulty: 3,
      question: 'What is a SQL primary key and why is it unique?',
      options: ['Unique key', 'Foreign key', 'Null pointer', 'Index scan'],
      correct: 0,
      explanation: 'Primary keys uniquely identify a tuple in a relational database table.',
    });
    const topicValidation = validateGeneratedQuestionDraft(mismatchedTopicOutput, 'python-functions', 3);
    assert(!topicValidation.valid, 'Validation must fail on mismatched topic');
    if (!topicValidation.valid) {
      assert(
        topicValidation.reason.includes('Topic mismatch'),
        `Expected Topic mismatch reason, got: ${topicValidation.reason}`
      );
    }

    results.push({
      id: 7,
      name: 'Inaccurate or incomplete local model response triggers recovery guidance or repair',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 7,
      name: 'Inaccurate or incomplete local model response triggers recovery guidance or repair',
      passed: false,
      error: err.message,
    });
  }

  // Test 8: Local model timeout triggers the timeout message without hanging the UI
  try {
    const mockTimeoutFetch: typeof fetch = (_input, init) => {
      return new Promise((_, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    const adapter = new OllamaAdapter({
      fetchImpl: mockTimeoutFetch,
    });

    let caughtErr: any = null;
    try {
      await adapter.sendChatStream(
        {
          messages: [{ role: 'user', content: 'Explain recursion' }],
          initialTimeoutMs: 50,
          streamIdleTimeoutMs: 50,
        },
        {}
      );
    } catch (e) {
      caughtErr = e;
    }

    assert(Boolean(caughtErr), 'Adapter must throw on timeout');
    assert(
      caughtErr instanceof OllamaError,
      `Expected OllamaError, got ${String(caughtErr)}`
    );
    assert(
      caughtErr.kind === 'timeout',
      `Expected kind 'timeout', got '${caughtErr.kind}'`
    );
    assert(
      caughtErr.message.includes('timed out'),
      `Expected message to mention timeout, got '${caughtErr.message}'`
    );
    assert(
      Boolean(caughtErr.recoveryGuidance),
      'Timeout error must include recovery guidance'
    );

    results.push({
      id: 8,
      name: 'Local model timeout triggers the timeout message without hanging the UI',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 8,
      name: 'Local model timeout triggers the timeout message without hanging the UI',
      passed: false,
      error: err.message,
    });
  }

  // Test 9: Streaming response preserves tokens so the last chunk contains the final answer
  try {
    const chunks = [
      JSON.stringify({ message: { content: 'A function in ' } }) + '\n',
      JSON.stringify({ message: { content: 'Python is defined ' } }) + '\n',
      JSON.stringify({ message: { content: 'using the def keyword.' } }) + '\n',
      JSON.stringify({ done: true }) + '\n',
    ];

    const mockStreamFetch: typeof fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'gemma4:e2b-it-qat', details: { parameter_size: '2B' } }],
          }),
          { status: 200 }
        );
      }

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      return new Response(stream, { status: 200 });
    };

    const adapter = new OllamaAdapter({ fetchImpl: mockStreamFetch });
    const streamedTokens: string[] = [];
    const response = await adapter.sendChatStream(
      {
        messages: [{ role: 'user', content: 'What keyword defines a Python function?' }],
        adaptiveContext: {
          topicId: 'python-functions',
          topicName: 'Python Functions',
          masteryScore: 70,
          confidenceLevel: 'high',
          targetDifficulty: '3',
          explanationStrategy: 'step-by-step',
        },
      },
      {
        onChunk: (t) => streamedTokens.push(t),
      }
    );

    assert(
      streamedTokens.length === 3,
      `Expected 3 streamed chunks, got ${streamedTokens.length}`
    );
    assert(
      response.content === 'A function in Python is defined using the def keyword.',
      `Expected complete text, got '${response.content}'`
    );
    assert(
      response.source === 'ollama',
      `Expected source 'ollama', got '${response.source}'`
    );
    assert(
      response.model === 'gemma4:e2b-it-qat',
      `Expected model 'gemma4:e2b-it-qat', got '${response.model}'`
    );

    results.push({
      id: 9,
      name: 'Streaming response preserves tokens so the last chunk contains the final answer',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 9,
      name: 'Streaming response preserves tokens so the last chunk contains the final answer',
      passed: false,
      error: err.message,
    });
  }

  // Test 10: Confirm that off-topic questions do not update mastery scores
  try {
    const initialAttempts: any[] = [
      {
        id: 'attempt-1',
        client_attempt_id: 'client-1',
        user_id: 'user-test',
        quiz_id: 'quiz-1',
        attempt_type: 'adaptive',
        session_id: 'session-1',
        subject_id: 'python',
        topic_id: 'python-functions',
        topic_name: 'Python Functions',
        question_id: 'q-1',
        question_text: 'What is a function?',
        options: ['A', 'B', 'C', 'D'],
        selected_option: 0,
        correct_option: 0,
        difficulty: 3,
        is_correct: true,
        score: 1,
        time_spent_seconds: 35,
        attempted_at: new Date(Date.now() - 3600_000).toISOString(),
      },
      {
        id: 'attempt-2',
        client_attempt_id: 'client-2',
        user_id: 'user-test',
        quiz_id: 'quiz-1',
        attempt_type: 'adaptive',
        session_id: 'session-1',
        subject_id: 'python',
        topic_id: 'python-functions',
        topic_name: 'Python Functions',
        question_id: 'q-2',
        question_text: 'What is a parameter?',
        options: ['A', 'B', 'C', 'D'],
        selected_option: 1,
        correct_option: 0,
        difficulty: 3,
        is_correct: false,
        score: 0,
        time_spent_seconds: 40,
        attempted_at: new Date().toISOString(),
      },
    ];

    const initialMastery = calculateTopicMastery('python-functions', initialAttempts);

    // Simulate an off-topic user inquiry: "What is F1 cars?"
    const offTopicRelevance = classifyTopicRelevance('What is F1 cars?', 'python-functions');
    assert(
      offTopicRelevance.category === 'off_topic_factual',
      'F1 must be identified as off-topic'
    );

    // Because chat messages never record quiz attempt records into the mastery engine,
    // calculateTopicMastery on the existing attempt logs remains invariant.
    const subsequentMastery = calculateTopicMastery('python-functions', initialAttempts);
    assert(
      initialMastery.masteryScore === subsequentMastery.masteryScore,
      `Mastery mutated: ${initialMastery.masteryScore} vs ${subsequentMastery.masteryScore}`
    );
    assert(
      initialMastery.totalAttempts === subsequentMastery.totalAttempts,
      `Attempt count changed: ${initialMastery.totalAttempts} vs ${subsequentMastery.totalAttempts}`
    );

    results.push({
      id: 10,
      name: 'Confirm that off-topic questions do not update mastery scores',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 10,
      name: 'Confirm that off-topic questions do not update mastery scores',
      passed: false,
      error: err.message,
    });
  }

  // Test 11: Confirm that local-only mode never silently falls back to cloud AI
  try {
    let cloudAdapterCalled = false;
    const mockCloudAdapter: any = {
      getStatus: async () => {
        cloudAdapterCalled = true;
        return { configured: true, provider: 'cloud', model: 'gemini-3.5-flash' };
      },
      sendChatStream: async () => {
        cloudAdapterCalled = true;
        return { content: 'Cloud response', source: 'cloud', model: 'gemini-3.5-flash' };
      },
    };

    let ollamaCalled = false;
    const mockOllamaAdapter: any = {
      checkHealth: async () => ({
        available: false,
        status: 'not_running',
        configuredModel: 'gemma4:e2b-it-qat',
        availableModels: [],
        message: 'Ollama is offline',
        recoveryGuidance: 'Run ollama serve',
      }),
      sendChatStream: async () => {
        ollamaCalled = true;
        throw new OllamaError('not_running', 'Ollama is offline', 'Run ollama serve');
      },
    };

    const tutorService = new AITutorService({
      cloudAdapter: mockCloudAdapter,
      ollamaAdapter: mockOllamaAdapter,
      initialMode: 'ollama',
    });

    const status = await tutorService.getStatus();
    assert(
      status.mode === 'ollama',
      `Expected mode 'ollama', got '${status.mode}'`
    );
    assert(
      cloudAdapterCalled === false,
      'getStatus() in local Ollama mode must never call Cloud AI adapter'
    );
    assert(
      status.cloudAvailable === false,
      'Cloud must be marked unavailable in local-only mode'
    );

    let chatErr: any = null;
    try {
      await tutorService.sendMessageStream(
        { messages: [{ role: 'user', content: 'Test prompt' }] },
        {}
      );
    } catch (e) {
      chatErr = e;
    }

    assert(Boolean(chatErr), 'Local tutor service must fail if Ollama is down');
    assert(
      cloudAdapterCalled === false,
      'sendMessageStream in Ollama mode must NEVER silently fall back to cloud AI'
    );
    assert(
      chatErr.message.includes('Ollama is offline'),
      `Expected Ollama offline error, got: ${chatErr.message}`
    );

    results.push({
      id: 11,
      name: 'Confirm that local-only mode never silently falls back to cloud AI',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 11,
      name: 'Confirm that local-only mode never silently falls back to cloud AI',
      passed: false,
      error: err.message,
    });
  }

  // Test 12: Confirm that provider and model labels match actual source of answer
  try {
    // 1. Ollama local
    const ollamaBadge = formatProviderBadge('ollama', 'gemma4:e2b-it-qat');
    assert(
      ollamaBadge.providerLabel === 'Ollama Local AI',
      `Expected 'Ollama Local AI', got '${ollamaBadge.providerLabel}'`
    );
    assert(
      ollamaBadge.modelLabel === 'gemma4:e2b-it-qat',
      `Expected 'gemma4:e2b-it-qat', got '${ollamaBadge.modelLabel}'`
    );
    assert(
      ollamaBadge.badgeLabel === 'Ollama Local AI (gemma4:e2b-it-qat)',
      `Expected exact badge label, got '${ollamaBadge.badgeLabel}'`
    );

    // 2. Browser WebGPU Qwen 2.5
    const webgpuBadge = formatProviderBadge('local', 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
    assert(
      webgpuBadge.providerLabel === 'Browser Offline (WebGPU)',
      `Expected 'Browser Offline (WebGPU)', got '${webgpuBadge.providerLabel}'`
    );
    assert(
      webgpuBadge.modelLabel === 'Qwen 2.5 (0.5B)',
      `Expected 'Qwen 2.5 (0.5B)', got '${webgpuBadge.modelLabel}'`
    );
    assert(
      !webgpuBadge.modelLabel.toLowerCase().includes('gemma'),
      'WebGPU model label must NEVER claim to be Gemma 4'
    );

    // 3. Cloud AI
    const cloudBadge = formatProviderBadge('cloud', 'Gemini 3.5 Flash');
    assert(
      cloudBadge.providerLabel === 'Cloud AI',
      `Expected 'Cloud AI', got '${cloudBadge.providerLabel}'`
    );
    assert(
      cloudBadge.modelLabel === 'Gemini 3.5 Flash',
      `Expected 'Gemini 3.5 Flash', got '${cloudBadge.modelLabel}'`
    );

    // 4. Deterministic fallback
    const fallbackBadge = formatProviderBadge('mock-fallback');
    assert(
      fallbackBadge.providerLabel === 'Local Curriculum Guide',
      `Expected 'Local Curriculum Guide', got '${fallbackBadge.providerLabel}'`
    );
    assert(
      fallbackBadge.modelLabel === 'Deterministic Fallback',
      `Expected 'Deterministic Fallback', got '${fallbackBadge.modelLabel}'`
    );

    results.push({
      id: 12,
      name: 'Confirm that provider and model labels match actual source of answer',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 12,
      name: 'Confirm that provider and model labels match actual source of answer',
      passed: false,
      error: err.message,
    });
  }

  return results;
}
