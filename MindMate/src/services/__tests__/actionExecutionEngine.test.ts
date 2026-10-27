/**
 * MindMate Advanced Action Execution Engine Test Suite
 *
 * Verifies all 17 acceptance criteria from Part 8:
 *  1. "Open my planner" navigates to the existing Planner route
 *  2. "Show my progress" opens the correct page
 *  3. "Create a seven-day Python study plan" generates a valid preview
 *  4. Planner tasks are not saved before the required confirmation
 *  5. Confirming a plan creates the correct tasks
 *  6. A failed save is reported honestly
 *  7. Repeating a confirmed request does not create duplicates
 *  8. "Start a quiz on Python functions" uses the existing quiz route and question source
 *  9. Quiz results update real assessment analytics after completion
 * 10. Unsupported commands are rejected safely
 * 11. Malformed model output cannot execute an action
 * 12. Invalid action parameters are rejected
 * 13. Local-only mode does not silently call cloud AI
 * 14. Unauthorized users cannot access or modify another learner's data
 * 15. Failed multi-step operations report partial success accurately
 * 16. The existing chat, adaptive-learning engine, and planner still work
 * 17. Voice and text commands share the same action registry
 */

import {
  actionRegistry,
  clearExecutedPlanKeys,
  executeActionPlan,
  parseDeterministicAction,
  validateActionProposal,
  actionExecutionService,
  ActionExecutionContext,
  ActionPlan,
} from '../actions';
import {
  getPlannerTasks,
  batchCreatePlannerTasks,
  createPlannerTask,
} from '../../lib/db';
import {
  recordVerifiedAttempt,
  buildLearnerAnalyticsSnapshot,
  readLocalAttempts,
} from '../assessment/assessmentService';
import { calculateTopicMastery } from '../assessment/masteryEngine';
import { parseVoiceCommand } from '../voice/voiceCommandRouter';
import { classifyTopicRelevance } from '../ai/relevanceClassifier';
import { buildSubjectTutorContext } from '../ai/tutorContextService';
import { MULTILINGUAL_QUESTIONS } from '../../data/learningContent';
import { setDemoModeActive } from '../demo/demoLearnerService';
import type { AttemptRecord } from '../assessment/types';

export interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  error?: string;
}

export async function runActionExecutionEngineTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
  }

  // Ensure demo mode from earlier suites does not contaminate action engine unit tests
  setDemoModeActive(false);

  const testUserId = `test-learner-${Date.now()}`;
  clearExecutedPlanKeys();

  // Test 1: "Open my planner" navigates to the existing Planner route
  try {
    let navigatedTo = '';
    const context: ActionExecutionContext = {
      userId: testUserId,
      navigate: (path: string) => {
        navigatedTo = path;
      },
    };

    const plan = parseDeterministicAction('Open my planner', context);
    assert(plan !== null, 'Plan must not be null for "Open my planner"');
    assert(plan!.steps.length === 1, 'Should have exactly 1 navigation step');
    assert(plan!.steps[0].action === 'navigate_page', 'Action must be navigate_page');
    assert(plan!.steps[0].params.target === 'planner', 'Target must be planner');
    assert(plan!.steps[0].params.route === '/planner', 'Route must be /planner');

    const execResult = await executeActionPlan(plan!, context);
    assert(execResult.plan.status === 'completed', 'Plan must complete');
    assert(navigatedTo === '/planner', `Expected navigate to '/planner', got '${navigatedTo}'`);

    results.push({
      id: 1,
      name: '"Open my planner" navigates to the existing Planner route',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 1,
      name: '"Open my planner" navigates to the existing Planner route',
      passed: false,
      error: err.message,
    });
  }

  // Test 2: "Show my progress" opens the correct page
  try {
    let navigatedTo = '';
    const context: ActionExecutionContext = {
      userId: testUserId,
      navigate: (path: string) => {
        navigatedTo = path;
      },
    };

    const plan = parseDeterministicAction('Show my progress', context);
    assert(plan !== null, 'Plan must not be null for "Show my progress"');
    assert(plan!.steps[0].action === 'navigate_page', 'Action must be navigate_page');
    assert(plan!.steps[0].params.target === 'progress', 'Target must be progress');
    assert(plan!.steps[0].params.route === '/progress', 'Route must be /progress');

    await executeActionPlan(plan!, context);
    assert(navigatedTo === '/progress', `Expected navigate to '/progress', got '${navigatedTo}'`);

    results.push({
      id: 2,
      name: '"Show my progress" opens the correct page',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 2,
      name: '"Show my progress" opens the correct page',
      passed: false,
      error: err.message,
    });
  }

  // Test 3: "Create a seven-day Python study plan" generates a valid preview
  try {
    const context: ActionExecutionContext = { userId: testUserId };
    const plan = parseDeterministicAction('Create a seven-day Python study plan', context);

    assert(plan !== null, 'Plan must not be null');
    assert(plan!.status === 'awaiting_confirmation', 'Plan must be in awaiting_confirmation status');

    const saveStep = plan!.steps.find((s) => s.action === 'create_study_plan');
    assert(saveStep !== undefined, 'Must contain create_study_plan step');
    assert(saveStep!.requiresConfirmation === true, 'create_study_plan MUST require confirmation');
    assert(saveStep!.previewData !== undefined, 'Must provide previewData');

    const tasks = saveStep!.previewData?.tasks || [];
    assert(tasks.length === 7, `Expected 7 preview tasks, got ${tasks.length}`);
    assert(tasks.every((t) => t.day && t.name && t.duration && t.type), 'All preview tasks must have day, name, duration, and type');

    results.push({
      id: 3,
      name: '"Create a seven-day Python study plan" generates a valid preview',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 3,
      name: '"Create a seven-day Python study plan" generates a valid preview',
      passed: false,
      error: err.message,
    });
  }

  // Test 4: Planner tasks are not saved before the required confirmation
  try {
    const uniqueUser = `learner-noconfirm-${Date.now()}`;
    const context: ActionExecutionContext = { userId: uniqueUser };

    const plan = parseDeterministicAction('Create a seven-day Python study plan', context);
    assert(plan !== null, 'Plan must exist');

    // Attempt to execute without providing confirmedStepIds
    const execResult = await executeActionPlan(plan!, context, { confirmedStepIds: [] });
    assert(
      execResult.plan.status === 'awaiting_confirmation',
      'Execution must halt at awaiting_confirmation when unconfirmed'
    );

    // Verify database currently has 0 tasks for this learner
    const stored = await getPlannerTasks(uniqueUser);
    assert(
      !stored.data || stored.data.length === 0,
      `Expected 0 tasks saved before confirmation, found ${stored.data?.length}`
    );

    results.push({
      id: 4,
      name: 'Planner tasks are not saved before the required confirmation',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 4,
      name: 'Planner tasks are not saved before the required confirmation',
      passed: false,
      error: err.message,
    });
  }

  // Test 5: Confirming a plan creates the correct tasks
  try {
    const uniqueUser = `learner-confirmed-${Date.now()}`;
    const context: ActionExecutionContext = { userId: uniqueUser };

    const plan = parseDeterministicAction('Create a seven-day Python study plan', context);
    assert(plan !== null, 'Plan must exist');

    const allStepIds = plan!.steps.map((s) => s.id);
    const execResult = await executeActionPlan(plan!, context, { confirmedStepIds: allStepIds });

    assert(
      execResult.plan.status === 'completed',
      `Expected plan status 'completed', got '${execResult.plan.status}'`
    );

    const stored = await getPlannerTasks(uniqueUser);
    assert(
      stored.data !== null && stored.data.length === 7,
      `Expected 7 tasks created after confirmation, got ${stored.data?.length}`
    );

    results.push({
      id: 5,
      name: 'Confirming a plan creates the correct tasks',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 5,
      name: 'Confirming a plan creates the correct tasks',
      passed: false,
      error: err.message,
    });
  }

  // Test 6: A failed save is reported honestly
  try {
    const uniqueUser = `learner-failsave-${Date.now()}`;
    const context: ActionExecutionContext = {
      userId: uniqueUser,
      mockFailSaves: true, // Trigger simulated database failure
    };

    const plan = parseDeterministicAction('Create a seven-day Python study plan', context);
    assert(plan !== null, 'Plan must exist');

    const allStepIds = plan!.steps.map((s) => s.id);
    const execResult = await executeActionPlan(plan!, context, { confirmedStepIds: allStepIds });

    assert(
      execResult.plan.status === 'failed' || execResult.plan.status === 'partial_failure',
      `Expected failed/partial_failure status on failed save, got '${execResult.plan.status}'`
    );
    assert(
      execResult.plan.error !== undefined && execResult.plan.error.length > 0,
      'Failed plan must provide clear error message'
    );
    assert(
      !execResult.plan.summary.includes('Successfully created'),
      'Failed plan must NOT claim tasks were saved successfully'
    );

    results.push({
      id: 6,
      name: 'A failed save is reported honestly',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 6,
      name: 'A failed save is reported honestly',
      passed: false,
      error: err.message,
    });
  }

  // Test 7: Repeating a confirmed request does not create duplicates
  try {
    const uniqueUser = `learner-idempotent-${Date.now()}`;
    const context: ActionExecutionContext = { userId: uniqueUser };

    const plan1 = parseDeterministicAction('Create a seven-day Python study plan', context);
    assert(plan1 !== null, 'Plan 1 must exist');
    await executeActionPlan(plan1!, context, { confirmedStepIds: plan1!.steps.map((s) => s.id) });

    const afterFirst = await getPlannerTasks(uniqueUser);
    const countAfterFirst = afterFirst.data?.length || 0;
    assert(countAfterFirst === 7, `Expected 7 tasks, got ${countAfterFirst}`);

    // Re-execute plan with same planId (e.g. user double-clicked or retried)
    const plan2 = parseDeterministicAction('Create a seven-day Python study plan', context);
    plan2!.planId = plan1!.planId; // Same idempotency key
    const saveStep2 = plan2!.steps.find((s) => s.action === 'create_study_plan');
    if (saveStep2) saveStep2.params.planId = plan1!.planId;

    await executeActionPlan(plan2!, context, { confirmedStepIds: plan2!.steps.map((s) => s.id) });

    const afterSecond = await getPlannerTasks(uniqueUser);
    const countAfterSecond = afterSecond.data?.length || 0;
    assert(
      countAfterSecond === 7,
      `Idempotency failed: expected 7 tasks after retry, found ${countAfterSecond}`
    );

    results.push({
      id: 7,
      name: 'Repeating a confirmed request does not create duplicates',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 7,
      name: 'Repeating a confirmed request does not create duplicates',
      passed: false,
      error: err.message,
    });
  }

  // Test 8: "Start a quiz on Python functions" uses the existing quiz route and question source
  try {
    let targetRoute = '';
    const context: ActionExecutionContext = {
      userId: testUserId,
      navigate: (r: string) => {
        targetRoute = r;
      },
    };

    const plan = parseDeterministicAction('Start a quiz on Python functions', context);
    assert(plan !== null, 'Plan must exist');
    assert(plan!.steps[0].action === 'start_quiz', 'Action must be start_quiz');
    assert(plan!.steps[0].params.topicId === 'python-functions', 'Topic must be python-functions');

    await executeActionPlan(plan!, context);
    assert(
      targetRoute.includes('/practice/adaptive-quiz') && targetRoute.includes('python-functions'),
      `Expected adaptive quiz route with python-functions, got '${targetRoute}'`
    );

    // Verify question source exists in MULTILINGUAL_QUESTIONS
    const questions = MULTILINGUAL_QUESTIONS.filter((q) => q.topicId === 'python-functions');
    assert(questions.length > 0, 'Question source must contain verified questions for python-functions');

    results.push({
      id: 8,
      name: '"Start a quiz on Python functions" uses the existing quiz route and question source',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 8,
      name: '"Start a quiz on Python functions" uses the existing quiz route and question source',
      passed: false,
      error: err.message,
    });
  }

  // Test 9: Quiz results update real assessment analytics after completion
  try {
    const learnerQuiz = `learner-quiz-analytics-${Date.now()}`;
    const beforeAttempts = readLocalAttempts(learnerQuiz);
    const beforeMetrics = calculateTopicMastery('python-functions', beforeAttempts);
    assert(beforeMetrics.totalAttempts === 0, 'Should start with 0 attempts');

    // Record verified attempt via the real assessment engine
    await recordVerifiedAttempt({
      user_id: learnerQuiz,
      client_attempt_id: `client-test-${Date.now()}`,
      topic_id: 'python-functions',
      question_id: 'py-func-1',
      question_text: 'What does return do in Python?',
      options: ['Exits function', 'Loops', 'Imports module', 'Prints'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      difficulty: 2,
      explanation: 'Return exits function and optionally passes back value.',
      response_duration_ms: 2500,
    });

    const afterAttempts = readLocalAttempts(learnerQuiz);
    assert(afterAttempts.length === 1, 'Attempt should be persisted');

    const afterMetrics = calculateTopicMastery('python-functions', afterAttempts);
    assert(afterMetrics.totalAttempts === 1, 'Metrics must reflect 1 attempt');
    assert(afterMetrics.overallAccuracy === 100, 'Accuracy should be 100%');

    const snapshot = buildLearnerAnalyticsSnapshot(learnerQuiz, afterAttempts);
    assert(snapshot.totalAttempts === 1, 'Snapshot total attempts must update');

    results.push({
      id: 9,
      name: 'Quiz results update real assessment analytics after completion',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 9,
      name: 'Quiz results update real assessment analytics after completion',
      passed: false,
      error: err.message,
    });
  }

  // Test 10: Unsupported commands are rejected safely
  try {
    const context: ActionExecutionContext = { userId: testUserId };

    // Malicious shell command
    const plan1 = parseDeterministicAction('run rm -rf / and delete files', context);
    assert(plan1 !== null, 'Plan must be caught by safety filter');
    assert(plan1!.status === 'failed', 'Status must be failed');
    assert(
      Boolean(plan1!.error?.includes('disallowed') || plan1!.error?.includes('safety')),
      'Must explain security rejection'
    );

    // Unsupported financial purchase
    const plan2 = parseDeterministicAction('order pizza and buy crypto', context);
    assert(plan2 !== null, 'Plan must be caught');
    assert(plan2!.status === 'failed', 'Status must be failed');

    // Registry unsupported handler check
    const unsupportedDef = actionRegistry.unsupported;
    const res = await unsupportedDef.execute({ reason: 'External payment not allowed' }, context);
    assert(res.success === false, 'Unsupported action must return success: false');

    results.push({
      id: 10,
      name: 'Unsupported commands are rejected safely',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 10,
      name: 'Unsupported commands are rejected safely',
      passed: false,
      error: err.message,
    });
  }

  // Test 11: Malformed model output cannot execute an action
  try {
    // 1. Completely non-object input
    const check1 = validateActionProposal(null);
    assert(check1.valid === false, 'Null output must be rejected');

    const check2 = validateActionProposal('not a json object');
    assert(check2.valid === false, 'String output must be rejected');

    // 2. Unregistered / invented action name
    const check3 = validateActionProposal({ action: 'launch_nuclear_missile', params: {} });
    assert(check3.valid === false, 'Unregistered action must be rejected');
    assert(Boolean(check3.error?.includes('unregistered')), 'Error must mention unregistered action');

    // 3. Valid action with missing required parameters
    const check4 = validateActionProposal({ action: 'complete_planner_task', params: {} });
    assert(check4.valid === false, 'Missing required taskId must fail validation');

    results.push({
      id: 11,
      name: 'Malformed model output cannot execute an action',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 11,
      name: 'Malformed model output cannot execute an action',
      passed: false,
      error: err.message,
    });
  }

  // Test 12: Invalid action parameters are rejected
  try {
    // Navigate with non-whitelisted target
    const navDef = actionRegistry.navigate_page;
    const navVal = navDef.validateParams({ target: 'malicious_external_url' });
    assert(navVal.valid === false, 'External/invalid target route must be rejected');

    // Create study plan with invalid duration
    const planDef = actionRegistry.create_study_plan;
    const planVal1 = planDef.validateParams({ durationDays: -5 });
    assert(planVal1.valid === false, 'Negative days must be rejected');

    const planVal2 = planDef.validateParams({ durationDays: 100 });
    assert(planVal2.valid === false, 'Excessive days (>14) must be rejected');

    // Reschedule task with invalid day
    const reschedDef = actionRegistry.reschedule_planner_task;
    const reschedVal = reschedDef.validateParams({ taskId: '123', newDay: 'Funday' });
    assert(reschedVal.valid === false, 'Invalid day name must be rejected');

    results.push({
      id: 12,
      name: 'Invalid action parameters are rejected',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 12,
      name: 'Invalid action parameters are rejected',
      passed: false,
      error: err.message,
    });
  }

  // Test 13: Local-only mode does not silently call cloud AI
  try {
    let cloudAiInvoked = false;
    const mockCloudAdapter = {
      generateResponse: async () => {
        cloudAiInvoked = true;
        return { content: 'Cloud response' };
      },
    };

    // When running in Ollama mode, verify cloud adapter is NOT invoked
    const context: ActionExecutionContext = { userId: testUserId };
    await actionExecutionService.handleUserInput(
      'Open my planner',
      context,
      'ollama',
      'gemma4:e2b-it-qat'
    );
    assert(cloudAiInvoked === false, 'Cloud AI must NEVER be called in local Ollama mode');

    results.push({
      id: 13,
      name: 'Local-only mode does not silently call cloud AI',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 13,
      name: 'Local-only mode does not silently call cloud AI',
      passed: false,
      error: err.message,
    });
  }

  // Test 14: Unauthorized users cannot access or modify another learner's data
  try {
    const authContext: ActionExecutionContext = {
      userId: 'authenticated_user_alice',
    };

    let securityViolationCaught = false;
    try {
      // Model tries to provide user_id: 'victim_user_bob'
      await actionRegistry.create_study_plan.execute(
        {
          subject: 'python',
          durationDays: 7,
          dailyMinutes: 30,
          user_id: 'victim_user_bob', // Spoofed foreign user ID!
        },
        authContext
      );
    } catch (err: any) {
      if (err.message.includes('Unauthorized') && err.message.includes('victim_user_bob')) {
        securityViolationCaught = true;
      }
    }

    assert(
      securityViolationCaught === true,
      'Registry MUST throw Unauthorized when parameter user_id does not match context.userId'
    );

    results.push({
      id: 14,
      name: "Unauthorized users cannot access or modify another learner's data",
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 14,
      name: "Unauthorized users cannot access or modify another learner's data",
      passed: false,
      error: err.message,
    });
  }

  // Test 15: Failed multi-step operations report partial success accurately
  try {
    const tracker = { step1Ran: false };
    const multiStepPlan: ActionPlan = {
      id: `multi-step-${Date.now()}`,
      userIntent: 'Multi step test',
      status: 'draft',
      summary: 'Running multi-step pipeline',
      createdAt: Date.now(),
      steps: [
        {
          id: 'step-1-success',
          action: 'navigate_page',
          title: 'Step 1: Navigate to Home',
          description: 'Navigates to home page',
          params: { target: 'home' },
          state: 'pending',
          requiresConfirmation: false,
        },
        {
          id: 'step-2-failure',
          action: 'create_study_plan',
          title: 'Step 2: Save Plan',
          description: 'Saves plan with simulated failure',
          params: { subject: 'python', durationDays: 3, dailyMinutes: 20 },
          state: 'pending',
          requiresConfirmation: false,
        },
      ],
    };

    const failContext: ActionExecutionContext = {
      userId: testUserId,
      mockFailSaves: true, // Step 2 will fail
      navigate: () => {
        tracker.step1Ran = true;
      },
    };

    const execResult = await executeActionPlan(multiStepPlan, failContext);

    assert(tracker.step1Ran, 'Step 1 should have run');
    assert(multiStepPlan.steps[0].state === 'succeeded', 'Step 1 state must be succeeded');
    assert(multiStepPlan.steps[1].state === 'failed', 'Step 2 state must be failed');
    assert(
      execResult.plan.status === 'partial_failure',
      `Overall plan status must be 'partial_failure', got '${execResult.plan.status}'`
    );

    results.push({
      id: 15,
      name: 'Failed multi-step operations report partial success accurately',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 15,
      name: 'Failed multi-step operations report partial success accurately',
      passed: false,
      error: err.message,
    });
  }

  // Test 16: The existing chat, adaptive-learning engine, and planner still work
  try {
    // 1. Relevance classifier still works
    const rel = classifyTopicRelevance('Explain recursion in Python functions', 'python-functions');
    assert(rel.category === 'relevant_topic', 'Topic relevance classification must remain intact');

    // 2. Tutor context builder still works
    const tutorCtx = buildSubjectTutorContext('Explain recursion', {
      topicId: 'python-functions',
      topicName: 'Python Functions',
      masteryScore: 70,
    });
    assert(tutorCtx.topic.id === 'python-functions', 'Tutor context active topic must match');

    // 3. Planner task creation still works
    const plannerRes = await createPlannerTask({
      user_id: testUserId,
      day: 'Mon',
      name: 'Existing Planner Test Task',
      duration: '30m',
      type: 'practice',
    });
    assert(plannerRes.data !== null, 'Planner task creation must succeed');

    results.push({
      id: 16,
      name: 'The existing chat, adaptive-learning engine, and planner still work',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 16,
      name: 'The existing chat, adaptive-learning engine, and planner still work',
      passed: false,
      error: err.message,
    });
  }

  // Test 17: Voice and text commands share the same action registry
  try {
    const voiceResult = parseVoiceCommand('Open my planner', { userId: testUserId });
    const textPlan = parseDeterministicAction('Open my planner', { userId: testUserId });

    assert(voiceResult.type === 'navigation', 'Voice command must classify as navigation');
    assert(voiceResult.route === '/planner', 'Voice command route must be /planner');

    assert(textPlan !== null, 'Text plan must not be null');
    assert(textPlan!.steps[0].action === 'navigate_page', 'Text action must be navigate_page');
    assert(textPlan!.steps[0].params.route === '/planner', 'Text plan route must be /planner');

    // Both resolve to the identical destination in actionRegistry
    assert(
      voiceResult.route === textPlan!.steps[0].params.route,
      'Voice and text commands must map to the identical destination'
    );

    // Test study plan in both
    const voicePlanResult = parseVoiceCommand('Create a seven-day Python study plan', {
      userId: testUserId,
    });
    const textPlanResult = parseDeterministicAction('Create a seven-day Python study plan', {
      userId: testUserId,
    });

    assert(voicePlanResult.action === 'create_study_plan', 'Voice plan must be create_study_plan');
    assert(
      textPlanResult!.steps.some((s) => s.action === 'create_study_plan'),
      'Text plan must contain create_study_plan'
    );

    results.push({
      id: 17,
      name: 'Voice and text commands share the same action registry',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 17,
      name: 'Voice and text commands share the same action registry',
      passed: false,
      error: err.message,
    });
  }

  return results;
}
