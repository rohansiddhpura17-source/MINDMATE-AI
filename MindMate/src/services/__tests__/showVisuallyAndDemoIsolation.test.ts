/**
 * MindMate — "Show Visually" & Demo Progress Isolation Test Suite
 *
 * Verifies:
 * 1. "Show visually" on Pandas produces clear comparison of Series vs DataFrames (Example A)
 * 2. "Show visually" on Python recursion produces recursion call-stack / flowchart diagram (Example B)
 * 3. "Show visually" on Database normalization produces 1NF -> 2NF -> 3NF decomposition diagram & comparison (Example C)
 * 4. "Show visually" on general concepts produces appropriate visual representations (Example D)
 * 5. Dedicated visual generation workflow identifies subject from preceding conversational context
 * 6. "Show visually" operations never add fake quiz attempts or modify mastery scores
 * 7. Demo mode active produces visible simulated demo status and isolated metrics
 * 8. Demo mode inactive/cleared restores genuine learner data (or empty state with 0 attempts) without contamination
 * 9. Toggling demo mode reactively preserves storage boundaries between real and simulated data
 */

import {
  generateVisualRepresentation,
  detectVisualFormat,
  buildComparisonData,
  buildDiagramData,
  extractVisualSubject,
} from '../visual/visualEngine';
import {
  findPrecedingTurn,
  buildFollowUpContext,
} from '../ai/followUpContext';
import {
  isDemoModeActive,
  setDemoModeActive,
  loadDemoProgress,
  clearDemoProgress,
  generateRealisticDemoAttempts,
} from '../demo/demoLearnerService';
import {
  loadLearnerAnalytics,
  readLocalAttempts,
  writeLocalAttempts,
  clearLocalAttempts,
} from '../assessment/assessmentService';
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

export async function runShowVisuallyAndDemoIsolationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (id: number, name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, error: err?.message || String(err) });
    }
  };

  // -------------------------------------------------------------------------
  // TEST 01: Pandas Series vs DataFrame Visual Comparison (Example A)
  // -------------------------------------------------------------------------
  await runTest(1, 'Show visually on Pandas produces clear comparison of Series vs DataFrames', async () => {
    const mockMessages = [
      { id: 1, role: 'user', content: 'What is Pandas?' },
      {
        id: 2,
        role: 'assistant',
        content: 'Pandas is a Python library for data manipulation. It provides Series for 1D labeled data and DataFrames for 2D tabular data.',
      },
    ];

    const precedingTurn = findPrecedingTurn(mockMessages);
    assert(Boolean(precedingTurn), 'Preceding turn must be located');
    assert(precedingTurn!.question === 'What is Pandas?', 'Question must match');

    const subject = extractVisualSubject(precedingTurn!.question, 'Python');
    assert(subject.toLowerCase().includes('pandas'), 'Subject must identify Pandas');

    const visual = await generateVisualRepresentation({
      question: precedingTurn!.question,
      answer: precedingTurn!.answer,
      subject,
      mode: 'offline',
      isOnline: false,
    });

    assert(visual.format === 'comparison_table', 'Pandas format should be comparison_table');
    assert(Boolean(visual.comparison), 'Comparison payload must exist');
    assert(
      visual.comparison!.title.includes('Pandas Data Architecture'),
      'Title should describe Pandas architecture'
    );
    assert(
      visual.comparison!.headers.includes('Pandas Series') &&
      visual.comparison!.headers.includes('Pandas DataFrame'),
      'Headers must compare Pandas Series and Pandas DataFrame'
    );
    assert(
      visual.comparison!.rows.some((r) => r.feature === 'Dimensionality'),
      'Must include Dimensionality comparison row'
    );
  });

  // -------------------------------------------------------------------------
  // TEST 02: Python Recursion Call-Stack Diagram (Example B)
  // -------------------------------------------------------------------------
  await runTest(2, 'Show visually on Python recursion produces call-stack flowchart diagram', async () => {
    const mockMessages = [
      { id: 1, role: 'user', content: 'Explain Python recursion.' },
      {
        id: 2,
        role: 'assistant',
        content: 'Recursion in Python occurs when a function calls itself to solve smaller subproblems until a base case is reached.',
      },
    ];

    const precedingTurn = findPrecedingTurn(mockMessages);
    assert(Boolean(precedingTurn), 'Preceding turn must be located');

    const subject = extractVisualSubject(precedingTurn!.question, 'Python');
    assert(subject.toLowerCase().includes('recursion'), 'Subject must identify recursion');

    const visual = await generateVisualRepresentation({
      question: precedingTurn!.question,
      answer: precedingTurn!.answer,
      subject,
      mode: 'offline',
      isOnline: false,
    });

    assert(visual.format === 'flowchart', 'Recursion format should be flowchart');
    assert(Boolean(visual.diagram), 'Diagram payload must exist');
    assert(
      visual.diagram!.title?.includes('Python Recursion') ||
      visual.diagram!.code.includes('factorial'),
      'Diagram must illustrate recursive factorial call stack'
    );
    assert(
      visual.diagram!.code.includes('Phase 1: Winding') || visual.diagram!.code.includes('Stack Frame'),
      'Diagram must illustrate stack frame winding'
    );
    assert(
      visual.diagram!.code.includes('Phase 2: Unwinding') || visual.diagram!.code.includes('Base case'),
      'Diagram must illustrate base case resolution or stack unwinding'
    );
  });

  // -------------------------------------------------------------------------
  // TEST 03: Database Normalization 1NF -> 2NF -> 3NF Decomposition (Example C)
  // -------------------------------------------------------------------------
  await runTest(3, 'Show visually on Database normalization produces 1NF -> 2NF -> 3NF decomposition diagram and table', async () => {
    const mockMessages = [
      { id: 1, role: 'user', content: 'Explain database normalization' },
      {
        id: 2,
        role: 'assistant',
        content: 'Database normalization is the structural decomposition of relational tables into 1NF, 2NF, and 3NF to eliminate redundancy and update anomalies.',
      },
    ];

    const precedingTurn = findPrecedingTurn(mockMessages);
    assert(Boolean(precedingTurn), 'Preceding turn must be located');

    const subject = extractVisualSubject(precedingTurn!.question, 'Database');
    assert(subject.toLowerCase().includes('normalization'), 'Subject must identify normalization');

    const visual = await generateVisualRepresentation({
      question: precedingTurn!.question,
      answer: precedingTurn!.answer,
      subject,
      mode: 'offline',
      isOnline: false,
    });

    assert(Boolean(visual.diagram), 'Diagram payload must be generated');
    assert(
      visual.diagram!.code.includes('1NF') &&
      visual.diagram!.code.includes('2NF') &&
      visual.diagram!.code.includes('3NF'),
      'Decomposition diagram must detail 1NF, 2NF, and 3NF stages'
    );

    assert(Boolean(visual.comparison), 'Comparison payload must be generated');
    assert(
      visual.comparison!.title.includes('Database Normalization'),
      'Comparison title must describe Database Normalization'
    );
    assert(
      visual.comparison!.rows.some((r) => r.feature.includes('1NF')) &&
      visual.comparison!.rows.some((r) => r.feature.includes('2NF')) &&
      visual.comparison!.rows.some((r) => r.feature.includes('3NF')),
      'Comparison rows must evaluate 1NF, 2NF, and 3NF'
    );
  });

  // -------------------------------------------------------------------------
  // TEST 04: General Concept Visual Generation (Example D)
  // -------------------------------------------------------------------------
  await runTest(4, 'Show visually on general concepts generates appropriate system diagrams', async () => {
    const cpuVisual = await generateVisualRepresentation({
      question: 'What is a CPU?',
      answer: 'A CPU contains a Control Unit, ALU, Registers, and Cache.',
      subject: 'CPU',
      mode: 'offline',
      isOnline: false,
    });

    assert(Boolean(cpuVisual.diagram), 'CPU visual must have diagram');
    assert(
      cpuVisual.diagram!.code.includes('Control Unit') && cpuVisual.diagram!.code.includes('ALU'),
      'CPU diagram must detail Von Neumann architecture'
    );
  });

  // -------------------------------------------------------------------------
  // TEST 05: "Show visually" button does not add fake quiz attempts or alter mastery
  // -------------------------------------------------------------------------
  await runTest(5, 'Visual generation strictly performs zero assessment writes and does not alter mastery scores', async () => {
    const testUserId = 'test-visual-isolation-user';
    clearLocalAttempts(testUserId);

    const initialAttempts = readLocalAttempts(testUserId);
    assert(initialAttempts.length === 0, 'Initial attempts must be 0');

    // Generate visual for Python recursion
    await generateVisualRepresentation({
      question: 'Explain Python recursion',
      answer: 'Functions calling themselves.',
      subject: 'Python recursion',
      mode: 'offline',
      isOnline: false,
    });

    const attemptsAfter = readLocalAttempts(testUserId);
    assert(
      attemptsAfter.length === 0,
      'Visual generation must NOT insert any quiz attempt records'
    );

    const mastery = calculateTopicMastery('Python Recursion', attemptsAfter);
    assert(mastery.totalAttempts === 0, 'Total attempts must remain 0');
    assert(mastery.masteryScore === 0, 'Mastery score must remain 0 (unassessed)');
  });

  // -------------------------------------------------------------------------
  // TEST 06: Demo mode active sets isDemoMode and isolates demo attempts
  // -------------------------------------------------------------------------
  await runTest(6, 'Demo mode active sets isDemoMode true and loads 41 isolated demo attempts', async () => {
    const demoUser = 'meet8kotecha';
    loadDemoProgress(demoUser);

    assert(isDemoModeActive(demoUser) === true, 'isDemoModeActive must be true');

    const analytics = await loadLearnerAnalytics(demoUser);
    assert(analytics.isDemoMode === true, 'analytics.isDemoMode must be true');
    assert(analytics.dataSource === 'demo', 'analytics.dataSource must be demo');
    assert(analytics.totalAttempts === 41, 'Demo dataset must contain exactly 41 attempts');
    assert(analytics.topics.length >= 8, 'Demo dataset must cover 8 topics');
    assert(analytics.averageMastery > 0, 'Demo dataset must calculate mastery');
  });

  // -------------------------------------------------------------------------
  // TEST 07: Demo mode cleared removes demo metrics and restores genuine data
  // -------------------------------------------------------------------------
  await runTest(7, 'Demo mode cleared restores genuine learner data and clean empty state if 0 attempts', async () => {
    const demoUser = 'meet8kotecha';
    clearDemoProgress(demoUser);

    assert(isDemoModeActive(demoUser) === false, 'isDemoModeActive must be false after clearing');

    // Make sure local attempts for genuine meet8kotecha are clean
    clearLocalAttempts(demoUser);

    const analytics = await loadLearnerAnalytics(demoUser);
    assert(analytics.isDemoMode === false, 'analytics.isDemoMode must be false');
    assert(analytics.dataSource !== 'demo', 'analytics.dataSource must not be demo');
    assert(analytics.totalAttempts === 0, 'Genuine learner with 0 attempts must show 0 attempts');
    assert(analytics.averageMastery === 0, 'Unassessed genuine learner must show 0% average mastery');
    assert(analytics.recentAccuracy === 0, 'Unassessed genuine learner must show 0% recent accuracy');
  });

  // -------------------------------------------------------------------------
  // TEST 08: Real learner attempts are never polluted by demo mode operations
  // -------------------------------------------------------------------------
  await runTest(8, 'Genuine learner records remain strictly isolated when demo mode is toggled', async () => {
    const realUser = 'real-verified-student';
    clearDemoProgress(realUser);
    clearLocalAttempts(realUser);

    // Write 1 genuine attempt for realUser
    const genuineAttempt: AttemptRecord = {
      id: 'genuine-att-01',
      client_attempt_id: 'genuine-client-01',
      user_id: realUser,
      quiz_id: 'real-quiz',
      attempt_type: 'diagnostic',
      session_id: 'real-session-01',
      subject_id: 'python',
      topic_id: 'python-variables',
      topic_name: 'Python Variables',
      concept_tag: 'variable-binding',
      difficulty: 1,
      question_id: 'q-real-01',
      question_text: 'What is x = 5?',
      options: ['Assign 5 to x', 'Print 5', 'Loop 5 times', 'Error'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Assignment statement',
      response_duration_ms: 5000,
      resolved: true,
      attempted_at: new Date().toISOString(),
      persistence_source: 'local',
    };
    writeLocalAttempts(realUser, [genuineAttempt]);

    // Now activate demo mode for meet8kotecha
    loadDemoProgress('meet8kotecha');
    assert(isDemoModeActive('meet8kotecha') === true, 'meet8kotecha should be in demo mode');

    // Check that realUser is not contaminated
    setDemoModeActive(false, realUser);
    const realAttempts = readLocalAttempts(realUser);
    assert(realAttempts.length === 1, 'Real learner attempts must remain exactly 1');
    assert(realAttempts[0].id === 'genuine-att-01', 'Real learner attempt ID must match');

    // Clean up
    clearLocalAttempts(realUser);
    clearDemoProgress('meet8kotecha');
  });

  return results;
}
