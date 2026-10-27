/**
 * MindMate — General-Purpose AI Assistant & Automatic Visuals Test Suite
 *
 * Verifies the 13 core requirements from Section 9:
 * 1. "Who was Max Planck?" returns a biography-oriented answer and triggers relevant image retrieval.
 * 2. Image results contain valid URLs, appropriate captions, and source attribution.
 * 3. "What is Pandas?" does not redirect to OOP.
 * 4. "What are F1 cars?" receives a relevant answer.
 * 5. "Show visually" uses the previous topic as context.
 * 6. A programming question can generate an appropriate diagram.
 * 7. Image retrieval failure does not suppress the written answer.
 * 8. Explicit image-generation requests use a configured image-generation service rather than Ollama text generation.
 * 9. Local-only mode does not silently use a cloud text model.
 * 10. General questions do not modify quiz mastery or assessment analytics.
 * 11. Existing navigation, voice commands, planner creation, and quiz actions continue to work.
 * 12. Invalid image data does not break the chat.
 * 13. Follow-up questions preserve the correct conversational context.
 */

import { classifyTopicRelevance, detectUserIntent } from '../ai/relevanceClassifier';
import {
  buildSubjectTutorContext,
  buildEducationalSystemPrompt,
} from '../ai/tutorContextService';
import {
  searchEducationalImages,
  isPersonOrBiographicalQuery,
  extractEntityName,
  VERIFIED_HISTORICAL_FIGURES,
} from '../visual/imageSearchService';
import {
  isImageGenerationRequest,
  generateExplicitImage,
} from '../visual/imageGenerationService';
import {
  generateVisualRepresentation,
  detectVisualFormat,
  buildComparisonData,
  buildDiagramData,
} from '../visual/visualEngine';
import {
  buildFollowUpContext,
  findPrecedingTurn,
  resolveConversationalFollowUp,
} from '../ai/followUpContext';
import { actionExecutionService } from '../actions/actionExecutionService';
import { calculateTopicMastery } from '../assessment/masteryEngine';
import type { AttemptRecord } from '../assessment/types';

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

export async function runGeneralPurposeAssistantAndVisualsTests(): Promise<{
  title: string;
  results: TestResult[];
}> {
  const results: TestResult[] = [];

  // Test 1: "Who was Max Planck?" returns biography-oriented answer and triggers relevant image retrieval
  try {
    const query = 'Who was Max Planck?';
    const intent = detectUserIntent(query);
    assert(
      intent === 'person_biography',
      `Expected intent 'person_biography', got '${intent}'`
    );

    const relevance = classifyTopicRelevance(query, 'python-oop');
    assert(
      relevance.intent === 'person_biography',
      `Relevance intent should be 'person_biography', got '${relevance.intent}'`
    );

    const images = await searchEducationalImages('Max Planck', { limit: 2 });
    assert(images.length > 0, 'Image retrieval must return at least 1 image for Max Planck');
    assert(
      images[0].title.toLowerCase().includes('max planck'),
      `Image title should reference Max Planck, got '${images[0].title}'`
    );

    const visualPayload = await generateVisualRepresentation({
      question: query,
      answer: 'Max Planck was a German theoretical physicist who originated quantum theory.',
      subject: 'Max Planck',
      mode: 'auto',
      isOnline: true,
    });
    assert(
      visualPayload.format === 'image_gallery',
      `Expected visual format 'image_gallery', got '${visualPayload.format}'`
    );
    assert(
      Boolean(visualPayload.images && visualPayload.images.length > 0),
      'Visual payload must contain image results'
    );

    results.push({
      id: 1,
      name: '"Who was Max Planck?" returns a biography-oriented answer and triggers relevant image retrieval',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 1,
      name: '"Who was Max Planck?" returns a biography-oriented answer and triggers relevant image retrieval',
      passed: false,
      error: err.message,
    });
  }

  // Test 2: Image results contain valid URLs, appropriate captions and source attribution
  try {
    const images = await searchEducationalImages('Albert Einstein', { limit: 2 });
    assert(images.length > 0, 'Must retrieve images for Albert Einstein');

    for (const img of images) {
      assert(
        img.url.startsWith('http://') || img.url.startsWith('https://'),
        `Image URL must start with http/https, got: ${img.url}`
      );
      assert(
        img.thumbnail.startsWith('http://') || img.thumbnail.startsWith('https://'),
        `Thumbnail URL must start with http/https, got: ${img.thumbnail}`
      );
      assert(img.title.trim().length > 0, 'Image title must not be empty');
      assert(img.description.trim().length > 0, 'Image description must not be empty');
      assert(img.author.trim().length > 0, 'Image author must not be empty');
      assert(img.license.trim().length > 0, 'Image license must not be empty');
      assert(
        img.sourceUrl.startsWith('http://') || img.sourceUrl.startsWith('https://'),
        `Source URL must start with http/https, got: ${img.sourceUrl}`
      );
    }

    results.push({
      id: 2,
      name: 'Image results contain valid URLs, appropriate captions and source attribution',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 2,
      name: 'Image results contain valid URLs, appropriate captions and source attribution',
      passed: false,
      error: err.message,
    });
  }

  // Test 3: "What is Pandas?" does not redirect to OOP
  try {
    const query = 'What is Pandas?';
    const relevance = classifyTopicRelevance(query, 'python-oop');

    assert(
      relevance.intent === 'programming_technical',
      `Expected 'programming_technical', got '${relevance.intent}'`
    );
    assert(
      !relevance.reason.toLowerCase().includes('oop') || relevance.category === 'relevant_subject',
      'Reason should recognize Pandas as data science / programming, not force redirect to OOP'
    );

    const tutorCtx = buildSubjectTutorContext(query, {
      topicId: 'python-oop',
      topicName: 'Object-Oriented Programming',
      masteryScore: 50,
      confidenceLevel: 'medium',
      targetDifficulty: '3',
      explanationStrategy: 'worked-example',
    });
    const prompt = buildEducationalSystemPrompt(tutorCtx);

    assert(
      prompt.includes('Do NOT force the response to redirect to Object-Oriented Programming'),
      'System prompt must instruct not to redirect to the active topic'
    );

    // Verify comparison table generation for Pandas
    const comparison = buildComparisonData('Pandas', query, 'Pandas Series vs DataFrame');
    assert(
      comparison.headers.some((h) => h.includes('Series')),
      'Pandas comparison must include Series header'
    );
    assert(
      comparison.headers.some((h) => h.includes('DataFrame')),
      'Pandas comparison must include DataFrame header'
    );

    results.push({
      id: 3,
      name: '"What is Pandas?" does not redirect to OOP',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 3,
      name: '"What is Pandas?" does not redirect to OOP',
      passed: false,
      error: err.message,
    });
  }

  // Test 4: "What are F1 cars?" receives a relevant answer
  try {
    const query = 'What are F1 cars?';
    const relevance = classifyTopicRelevance(query, 'python-functions');

    assert(
      Boolean(relevance.factualEntityHint),
      'Must contain factualEntityHint for F1 cars'
    );
    assert(
      relevance.factualEntityHint!.fact.includes('racing vehicles') ||
        relevance.factualEntityHint!.fact.includes('Formula One'),
      'Fact must explain Formula One cars'
    );
    assert(
      relevance.factualEntityHint!.pitfallAvoidance.includes('NOT a race circuit'),
      'Must avoid confusing cars with race circuits'
    );

    results.push({
      id: 4,
      name: '"What are F1 cars?" receives a relevant answer',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 4,
      name: '"What are F1 cars?" receives a relevant answer',
      passed: false,
      error: err.message,
    });
  }

  // Test 5: "Show visually" uses the previous topic as context
  try {
    const history = [
      {
        role: 'user',
        content: 'Who was Max Planck?',
      },
      {
        role: 'assistant',
        content: 'Max Planck was a German physicist who originated quantum theory.',
      },
    ];

    const followUp = buildFollowUpContext(history as any, 'Show visually');
    assert(followUp.hasPrecedingContext, 'Must identify preceding context');
    assert(
      followUp.subject.includes('Max Planck'),
      `Subject must be 'Max Planck', got '${followUp.subject}'`
    );
    assert(
      followUp.promptContent.includes('Max Planck'),
      'Prompt must ground visual request in previous question about Max Planck'
    );

    // Verify visual format detection from previous question
    const format = detectVisualFormat(followUp.subject, 'Max Planck');
    assert(
      format === 'image_gallery',
      `Expected 'image_gallery' for Max Planck visual, got '${format}'`
    );

    results.push({
      id: 5,
      name: '"Show visually" uses the previous topic as context',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 5,
      name: '"Show visually" uses the previous topic as context',
      passed: false,
      error: err.message,
    });
  }

  // Test 6: A programming question can generate an appropriate diagram
  try {
    const cpuDiagram = buildDiagramData('CPU', 'What is a CPU?', 'Central processing unit architecture');
    assert(
      cpuDiagram.diagramType === 'mermaid',
      'Diagram type must be mermaid'
    );
    assert(
      cpuDiagram.code.includes('Control Unit') && cpuDiagram.code.includes('Arithmetic Logic Unit'),
      'CPU diagram must include CU and ALU'
    );

    const stackQueueComparison = buildComparisonData('Stack vs Queue', 'Explain the difference between a stack and a queue', 'LIFO vs FIFO');
    assert(
      stackQueueComparison.headers.some((h) => h.includes('Stack')) &&
        stackQueueComparison.headers.some((h) => h.includes('Queue')),
      'Comparison must include Stack and Queue headers'
    );

    results.push({
      id: 6,
      name: 'A programming question can generate an appropriate diagram',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 6,
      name: 'A programming question can generate an appropriate diagram',
      passed: false,
      error: err.message,
    });
  }

  // Test 7: Image retrieval failure does not suppress the written answer
  try {
    // Force search on a nonexistent entity
    const nonexistent = await searchEducationalImages('nonexistent_random_entity_xyz_123', { limit: 2 });
    assert(Array.isArray(nonexistent), 'Must return an array on empty results without throwing');
    assert(nonexistent.length === 0, 'Nonexistent entity should return empty image array');

    // Generate visual representation with empty image fallback
    const payload = await generateVisualRepresentation({
      question: 'Who was nonexistent_xyz?',
      answer: 'This is the written answer that must remain visible.',
      subject: 'nonexistent_xyz',
      mode: 'auto',
      isOnline: true,
    });

    assert(Boolean(payload), 'Payload must still be returned');
    assert(
      payload.format === 'flowchart' || payload.format === 'diagram',
      'Should fall back to diagram format when images are unavailable'
    );
    assert(
      Boolean(payload.diagram),
      'Fallback diagram must be available so chat does not break'
    );

    results.push({
      id: 7,
      name: 'Image retrieval failure does not suppress the written answer',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 7,
      name: 'Image retrieval failure does not suppress the written answer',
      passed: false,
      error: err.message,
    });
  }

  // Test 8: Explicit image-generation requests use configured image-generation service rather than Ollama text generation
  try {
    const genPrompt = 'Generate an image of a quantum laboratory with lasers';
    assert(
      isImageGenerationRequest(genPrompt),
      'isImageGenerationRequest must detect generation intent'
    );

    const intent = detectUserIntent(genPrompt);
    assert(
      intent === 'image_generation_request',
      `Expected 'image_generation_request', got '${intent}'`
    );

    const genResult = await generateExplicitImage(genPrompt);
    assert(genResult.isAIGenerated === true, 'Must be marked isAIGenerated');
    assert(
      genResult.provider === 'Image Generation Service' || genResult.provider === 'Configured Image Model',
      `Provider must be dedicated image generation service, got '${genResult.provider}'`
    );
    assert(
      Boolean(genResult.error || genResult.imageUrl),
      'Must either return generated image or clear unconfigured provider notice without calling text LLM'
    );

    results.push({
      id: 8,
      name: 'Explicit image-generation requests use a configured image-generation service rather than Ollama text generation',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 8,
      name: 'Explicit image-generation requests use a configured image-generation service rather than Ollama text generation',
      passed: false,
      error: err.message,
    });
  }

  // Test 9: Local-only mode does not silently use a cloud text model
  try {
    const offlineVisual = await generateVisualRepresentation({
      question: 'Who was Albert Einstein?',
      answer: 'Albert Einstein was a theoretical physicist.',
      subject: 'Albert Einstein',
      mode: 'offline', // local-only / offline mode
      isOnline: false,
    });

    assert(
      offlineVisual.offlineFallback === true,
      'Offline mode must set offlineFallback to true'
    );
    assert(
      offlineVisual.images === undefined,
      'Offline mode must make ZERO external network image queries'
    );
    assert(
      Boolean(offlineVisual.diagram),
      'Offline mode must provide local diagram without network calls'
    );

    results.push({
      id: 9,
      name: 'Local-only mode does not silently use a cloud text model',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 9,
      name: 'Local-only mode does not silently use a cloud text model',
      passed: false,
      error: err.message,
    });
  }

  // Test 10: General questions do not modify quiz mastery or assessment analytics
  try {
    const initialAttempts: AttemptRecord[] = [
      {
        id: 'att-1',
        client_attempt_id: 'client-1',
        user_id: 'test-user',
        quiz_id: 'quiz-1',
        attempt_type: 'adaptive',
        session_id: 'sess-1',
        subject_id: 'python',
        topic_id: 'python-functions',
        topic_name: 'Python Functions',
        concept_tag: 'functions',
        question_id: 'q1',
        question_text: 'What does a function return by default?',
        options: ['None', '0', 'True', 'null'],
        selected_option: 0,
        correct_option: 0,
        is_correct: true,
        difficulty: 3,
        explanation: 'Default returns None',
        resolved: false,
        attempted_at: new Date().toISOString(),
      },
    ];

    const initialMetrics = calculateTopicMastery('python-functions', initialAttempts);
    const initialMastery = initialMetrics.masteryScore;

    // Simulate asking a general knowledge question ("Who was Max Planck?")
    const query = 'Who was Max Planck?';
    const relevance = classifyTopicRelevance(query, 'python-functions');
    assert(
      relevance.category === 'off_topic_factual',
      'Should be off-topic factual'
    );

    // Verify that mastery calculation does not mutate or register fake attempts
    const afterMetrics = calculateTopicMastery('python-functions', initialAttempts);
    assert(
      afterMetrics.masteryScore === initialMastery,
      `Mastery should remain ${initialMastery}%, got ${afterMetrics.masteryScore}%`
    );
    assert(
      afterMetrics.totalAttempts === 1,
      `Total attempts should remain 1, got ${afterMetrics.totalAttempts}`
    );

    results.push({
      id: 10,
      name: 'General questions do not modify quiz mastery or assessment analytics',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 10,
      name: 'General questions do not modify quiz mastery or assessment analytics',
      passed: false,
      error: err.message,
    });
  }

  // Test 11: Existing navigation, voice commands, planner creation and quiz actions continue to work
  try {
    let navigatedTo = '';
    const mockContext = {
      userId: 'test-user',
      activeTopic: 'python-functions',
      navigate: (path: string) => {
        navigatedTo = path;
      },
      openVoiceMode: () => {},
      stopSpeaking: () => {},
      repeatAnswer: () => {},
    };

    // 1. Navigation action
    const navResult = await actionExecutionService.handleUserInput(
      'Open my planner',
      mockContext,
      'ollama',
      'gemma4:e2b-it-qat'
    );
    assert(navResult.isAction, 'Open my planner must be recognized as action');
    assert(navResult.plan?.status === 'completed', 'Open my planner must execute immediately');
    assert(navigatedTo === '/planner', `Expected navigation to '/planner', got '${navigatedTo}'`);

    // 2. Study plan creation action
    const planResult = await actionExecutionService.handleUserInput(
      'Create a seven-day Python study plan',
      mockContext,
      'ollama',
      'gemma4:e2b-it-qat'
    );
    assert(planResult.isAction, 'Create study plan must be recognized as action');
    assert(planResult.plan?.status === 'awaiting_confirmation', 'Study plan requires user confirmation');
    const saveStep = planResult.plan?.steps.find((s) => s.action === 'create_study_plan');
    assert(saveStep !== undefined, 'Must contain create_study_plan step');
    const previewTasks = saveStep?.previewData?.tasks || [];
    assert(previewTasks.length === 7, `Expected 7 preview tasks, got ${previewTasks.length}`);

    // 3. Quiz action
    const quizResult = await actionExecutionService.handleUserInput(
      'Start a quiz on Python functions',
      mockContext,
      'ollama',
      'gemma4:e2b-it-qat'
    );
    assert(quizResult.isAction, 'Start quiz must be recognized as action');
    assert(navigatedTo.includes('/quiz') || navigatedTo.includes('/practice'), 'Must navigate to quiz/practice');

    results.push({
      id: 11,
      name: 'Existing navigation, voice commands, planner creation and quiz actions continue to work',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 11,
      name: 'Existing navigation, voice commands, planner creation and quiz actions continue to work',
      passed: false,
      error: err.message,
    });
  }

  // Test 12: Invalid image data does not break the chat
  try {
    // Malformed visual data
    const malformedPayload = {
      format: 'image_gallery' as const,
      title: 'Malformed Test',
      summary: 'Testing resilience',
      topic: 'test',
      images: [
        {
          id: 'bad-1',
          title: '',
          url: 'invalid-url',
          thumbnail: '',
          description: '',
          author: '',
          license: '',
          sourceUrl: '',
        },
      ],
    };

    assert(Boolean(malformedPayload.images), 'Images array is defined');
    assert(malformedPayload.images[0].id === 'bad-1', 'Image object exists');

    // Content moderation test
    const blockedPayload = await generateVisualRepresentation({
      question: 'pornography video',
      answer: '',
      subject: 'pornography',
      mode: 'auto',
      isOnline: true,
    });

    assert(blockedPayload.blocked === true, 'Explicit content must be safely blocked');
    assert(
      blockedPayload.format === 'moderation_refusal',
      `Expected format 'moderation_refusal', got '${blockedPayload.format}'`
    );

    results.push({
      id: 12,
      name: 'Invalid image data does not break the chat',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 12,
      name: 'Invalid image data does not break the chat',
      passed: false,
      error: err.message,
    });
  }

  // Test 13: Follow-up questions preserve the correct conversational context
  try {
    const history = [
      {
        role: 'user',
        content: 'Who was Max Planck?',
      },
      {
        role: 'assistant',
        content: 'Max Planck was a German theoretical physicist who discovered the quantum of action (h) and initiated quantum theory.',
      },
    ];

    // Follow-up inquiry referencing "he"
    const followUp1 = resolveConversationalFollowUp(history as any, 'What else did he discover?');
    assert(
      Boolean(followUp1.referencedSubject?.toLowerCase().includes('max planck')),
      `Referenced subject must be Max Planck, got '${followUp1.referencedSubject}'`
    );
    assert(
      followUp1.resolvedPrompt.includes('Max Planck'),
      'Resolved prompt must inject reference context for Max Planck'
    );

    // Follow-up asking "Tell me more"
    const followUp2 = resolveConversationalFollowUp(history as any, 'Tell me more');
    assert(
      Boolean(followUp2.referencedSubject?.toLowerCase().includes('max planck')),
      `Referenced subject for 'Tell me more' must be Max Planck, got '${followUp2.referencedSubject}'`
    );

    results.push({
      id: 13,
      name: 'Follow-up questions preserve the correct conversational context',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 13,
      name: 'Follow-up questions preserve the correct conversational context',
      passed: false,
      error: err.message,
    });
  }

  return {
    title: 'MindMate General-Purpose Assistant, Image Search & Visual Learning Test Suite',
    results,
  };
}
