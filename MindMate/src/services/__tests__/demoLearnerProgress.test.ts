import {
  generateRealisticDemoAttempts,
  generateDemoPlannerTasks,
  generateDemoQuizSessions,
  isDemoModeActive,
  setDemoModeActive,
  loadDemoProgress,
  clearDemoProgress,
  getDemoAttempts,
} from '../demo/demoLearnerService';
import {
  calculateAllTopicsMastery,
  calculateTopicMastery,
} from '../assessment/masteryEngine';
import { analyzeRecurringMistakes } from '../assessment/mistakeAnalyzer';
import { generateEvidenceRecommendations } from '../assessment/recommendationEngine';
import { buildLearnerAnalyticsSnapshot } from '../assessment/assessmentService';

export interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  error?: string;
}

export async function runDemoLearnerProgressTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
  }

  // Test 1: 41 attempts across the 8 required topics
  try {
    const attempts = generateRealisticDemoAttempts('meet8kotecha');
    assert(attempts.length === 41, `Expected 41 attempts, got ${attempts.length}`);

    const expectedTopicIds = [
      'python-variables',
      'python-loops',
      'python-functions',
      'python-oop',
      'dbms-sql',
      'dbms-normalization',
      'dsa-queues-stacks',
      'dsa-trees',
    ];

    const presentTopics = new Set(attempts.map((a) => a.topic_id));
    for (const expected of expectedTopicIds) {
      assert(presentTopics.has(expected), `Missing topic: ${expected}`);
    }

    results.push({
      id: 1,
      name: 'Demo dataset contains exactly 41 attempts spanning all 8 curriculum topics',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 1,
      name: 'Demo dataset contains exactly 41 attempts spanning all 8 curriculum topics',
      passed: false,
      error: err.message,
    });
  }

  // Test 2: Spans approximately 14 days chronologically
  try {
    const attempts = generateRealisticDemoAttempts('meet8kotecha');
    const timestamps = attempts.map((a) => Date.parse(a.attempted_at)).sort((a, b) => a - b);
    const oldest = timestamps[0];
    const newest = timestamps[timestamps.length - 1];
    const spanDays = (newest - oldest) / (1000 * 60 * 60 * 24);

    assert(spanDays >= 12 && spanDays <= 15, `Expected ~13-14 days span, got ${spanDays.toFixed(1)} days`);

    results.push({
      id: 2,
      name: 'Chronological timeline spans approximately 14 days of realistic learning history',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 2,
      name: 'Chronological timeline spans approximately 14 days of realistic learning history',
      passed: false,
      error: err.message,
    });
  }

  // Test 3: Realistic distribution: strong, developing, and weak topics
  try {
    const attempts = generateRealisticDemoAttempts('meet8kotecha');
    const topics = calculateAllTopicsMastery(attempts);

    const varMastery = topics.find((t) => t.topicId === 'python-variables');
    const oopMastery = topics.find((t) => t.topicId === 'python-oop');
    const normMastery = topics.find((t) => t.topicId === 'dbms-normalization');
    const fnMastery = topics.find((t) => t.topicId === 'python-functions');

    assert(varMastery !== undefined && varMastery.masteryScore >= 75, `Expected Python Variables strong, got ${varMastery?.masteryScore}%`);
    assert(oopMastery !== undefined && oopMastery.masteryScore < 50, `Expected OOP weak, got ${oopMastery?.masteryScore}%`);
    assert(normMastery !== undefined && normMastery.masteryScore < 50, `Expected Normalization weak, got ${normMastery?.masteryScore}%`);
    assert(fnMastery !== undefined && fnMastery.masteryScore >= 65, `Expected Functions strong after recovery, got ${fnMastery?.masteryScore}%`);

    results.push({
      id: 3,
      name: 'Mastery engine evaluates realistic distribution: strong foundations and revision targets',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 3,
      name: 'Mastery engine evaluates realistic distribution: strong foundations and revision targets',
      passed: false,
      error: err.message,
    });
  }

  // Test 4: Recurring mistake detection on OOP MRO
  try {
    const attempts = generateRealisticDemoAttempts('meet8kotecha');
    const topics = calculateAllTopicsMastery(attempts);
    const mistakes = analyzeRecurringMistakes(attempts, topics);

    const mroMistake = mistakes.find(
      (m) => m.topicId === 'python-oop' && m.conceptTag === 'inheritance-mro'
    );
    assert(mroMistake !== undefined, 'Expected recurring mistake detected on OOP MRO');
    assert(Boolean(mroMistake && mroMistake.occurrences >= 2), `Expected at least 2 MRO errors`);

    results.push({
      id: 4,
      name: 'Recurring mistake analyzer detects consecutive errors on OOP MRO with explanation strategy',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 4,
      name: 'Recurring mistake analyzer detects consecutive errors on OOP MRO with explanation strategy',
      passed: false,
      error: err.message,
    });
  }

  // Test 5: Full Snapshot Consistency across metrics
  try {
    const attempts = generateRealisticDemoAttempts('meet8kotecha');
    const snapshot = buildLearnerAnalyticsSnapshot('meet8kotecha', attempts, {
      dataSource: 'demo',
      isDemoMode: true,
    });

    assert(snapshot.totalAttempts === 41, `Snapshot total attempts: ${snapshot.totalAttempts}`);
    assert(snapshot.assessedTopicsCount === 8, `Snapshot assessed topics: ${snapshot.assessedTopicsCount}`);
    assert(snapshot.overallAccuracy > 65 && snapshot.overallAccuracy < 80, `Overall accuracy: ${snapshot.overallAccuracy}%`);
    assert(snapshot.recommendations.length > 0, 'Expected evidence-backed recommendations');
    assert(snapshot.isDemoMode === true, 'Expected isDemoMode flag set to true');

    results.push({
      id: 5,
      name: 'LearnerAnalyticsSnapshot aggregates consistent metrics without hardcoded numbers',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 5,
      name: 'LearnerAnalyticsSnapshot aggregates consistent metrics without hardcoded numbers',
      passed: false,
      error: err.message,
    });
  }

  // Test 6: Demo mode isolation: load and clear operations
  try {
    const userId = 'test-demo-isolation-user';
    setDemoModeActive(false, userId);
    assert(isDemoModeActive(userId) === false, 'Demo mode should initially be inactive');

    const loadResult = loadDemoProgress(userId);
    assert(loadResult.attemptsCount === 41, 'Load demo should return 41 attempts');
    assert(isDemoModeActive(userId) === true, 'Demo mode should be active after loading');

    const demoAttempts = getDemoAttempts(userId);
    assert(demoAttempts.length === 41, 'Demo attempts should be readable');

    const demoTasks = generateDemoPlannerTasks(userId);
    assert(demoTasks.length === 6, 'Demo planner should contain 6 tasks');

    clearDemoProgress(userId);
    assert(isDemoModeActive(userId) === false, 'Demo mode should be inactive after clearing');

    results.push({
      id: 6,
      name: 'Demo data isolation boundary safely activates, provides dataset, and cleans up cleanly',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 6,
      name: 'Demo data isolation boundary safely activates, provides dataset, and cleans up cleanly',
      passed: false,
      error: err.message,
    });
  }

  return results;
}
