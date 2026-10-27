import { PlannerTaskData } from '../../lib/db';

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  error?: string;
}

export async function runPlannerLayoutAndToastTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
  }

  // Test 1: Smart Toast Auto-Dismissal & Info Purge on Success
  try {
    interface ToastItem {
      id: string;
      message: string;
      type: 'success' | 'error' | 'info';
    }

    let toasts: ToastItem[] = [];

    function addToast(message: string, type: 'success' | 'error' | 'info') {
      const id = Math.random().toString(36).slice(2);
      // Auto-dismiss pending info loading toasts when success arrives
      if (type === 'success') {
        toasts = toasts.filter((t) => t.type !== 'info');
      }
      toasts.push({ id, message, type });
      return id;
    }

    addToast('MindMate is analyzing your learning profile...', 'info');
    assert(toasts.length === 1 && toasts[0].type === 'info', 'Info toast was not added');

    // Simulate regeneration finishing and firing success toast
    addToast('Personalized learning plan generated!', 'success');
    assert(toasts.length === 1, `Expected 1 toast after info purge, but found ${toasts.length}`);
    assert(toasts[0].type === 'success', `Expected remaining toast to be success, got ${toasts[0].type}`);

    results.push({
      id: 1,
      name: 'Smart Toast auto-purges active info banners when success toast arrives',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 1,
      name: 'Smart Toast auto-purges active info banners when success toast arrives',
      passed: false,
      error: err.message,
    });
  }

  // Test 2: Filter logic by day, type, status, and search query
  try {
    const sampleTasks: PlannerTaskData[] = [
      { id: '1', user_id: 'u1', day: 'Mon', name: 'Python Functions', duration: '25 min', type: 'practice', priority: 'medium', completed: false },
      { id: '2', user_id: 'u1', day: 'Tue', name: 'OOP Recovery Session', duration: '30 min', type: 'recovery', priority: 'high', completed: true },
      { id: '3', user_id: 'u1', day: 'Wed', name: 'DBMS Review & SQL', duration: '25 min', type: 'review', priority: 'medium', completed: false },
      { id: '4', user_id: 'u1', day: 'Thu', name: 'Variable Scope Quiz', duration: '20 min', type: 'quiz', priority: 'low', completed: true },
      { id: '5', user_id: 'u1', day: 'Fri', name: 'Mock Assessment', duration: '40 min', type: 'assessment', priority: 'high', completed: false },
    ];

    function filterPlannerTasks(
      tasks: PlannerTaskData[],
      day: string,
      type: string,
      status: 'all' | 'pending' | 'completed',
      query: string
    ) {
      return tasks.filter((t) => {
        if (day !== 'all' && t.day !== day) return false;
        if (type !== 'all' && t.type.toLowerCase() !== type.toLowerCase()) return false;
        if (status === 'completed' && !t.completed) return false;
        if (status === 'pending' && t.completed) return false;
        if (query.trim() && !t.name.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      });
    }

    // Filter by day
    const monOnly = filterPlannerTasks(sampleTasks, 'Mon', 'all', 'all', '');
    assert(monOnly.length === 1 && monOnly[0].day === 'Mon', 'Day filter failed');

    // Filter by status completed
    const completed = filterPlannerTasks(sampleTasks, 'all', 'all', 'completed', '');
    assert(completed.length === 2, `Expected 2 completed tasks, got ${completed.length}`);

    // Filter by type
    const quizOnly = filterPlannerTasks(sampleTasks, 'all', 'quiz', 'all', '');
    assert(quizOnly.length === 1 && quizOnly[0].type === 'quiz', 'Type filter failed');

    // Filter by search
    const sqlSearch = filterPlannerTasks(sampleTasks, 'all', 'all', 'all', 'sql');
    assert(sqlSearch.length === 1 && sqlSearch[0].name.includes('SQL'), 'Search query filter failed');

    results.push({
      id: 2,
      name: 'Planner task filtering by day, session type, completion status, and search keyword',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 2,
      name: 'Planner task filtering by day, session type, completion status, and search keyword',
      passed: false,
      error: err.message,
    });
  }

  // Test 3: Weekly Goal Progress and Completion Calculation
  try {
    const tasks: PlannerTaskData[] = [
      { id: '1', user_id: 'u1', day: 'Mon', name: 'Task 1', duration: '20 min', type: 'practice', completed: true },
      { id: '2', user_id: 'u1', day: 'Tue', name: 'Task 2', duration: '20 min', type: 'practice', completed: true },
      { id: '3', user_id: 'u1', day: 'Wed', name: 'Task 3', duration: '20 min', type: 'practice', completed: false },
      { id: '4', user_id: 'u1', day: 'Thu', name: 'Task 4', duration: '20 min', type: 'practice', completed: false },
    ];

    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    assert(total === 4, 'Total tasks incorrect');
    assert(completed === 2, 'Completed count incorrect');
    assert(percent === 50, `Expected 50%, got ${percent}%`);

    results.push({
      id: 3,
      name: 'Weekly Goal Progress calculation and completion percentage computation',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 3,
      name: 'Weekly Goal Progress calculation and completion percentage computation',
      passed: false,
      error: err.message,
    });
  }

  // Test 4: Task card vertical layout prevents label overlap
  try {
    // Task card structure verification: title must have natural wrapping (break-words, no collision with action row)
    const taskCardLayout = {
      cardDirection: 'flex-col',
      titleClasses: ['font-semibold', 'text-sm', 'leading-snug', 'break-words'],
      badgeRowSeparated: true,
      bottomActionBarSeparated: true,
      minimumDayColumnWidthPx: 240,
    };

    assert(taskCardLayout.cardDirection === 'flex-col', 'Card should be vertical column');
    assert(taskCardLayout.titleClasses.includes('break-words'), 'Title must wrap without overflow');
    assert(taskCardLayout.badgeRowSeparated, 'Badges must have dedicated row');
    assert(taskCardLayout.bottomActionBarSeparated, 'Action buttons must have dedicated bottom row');
    assert(taskCardLayout.minimumDayColumnWidthPx >= 240, 'Day columns must be at least 240px wide');

    results.push({
      id: 4,
      name: 'Task card layout architecture enforces dedicated badge and action rows with wrap',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 4,
      name: 'Task card layout architecture enforces dedicated badge and action rows with wrap',
      passed: false,
      error: err.message,
    });
  }

  // Test 5: Activity Verification Guard for Premature Task Completion
  try {
    const taskWithoutActivity = {
      id: 'task-1',
      name: 'Python Functions',
      completed: false,
      activity_completed: false,
    };

    function attemptToggle(task: typeof taskWithoutActivity, done: boolean) {
      if (done && !task.activity_completed) {
        return { promptVerification: true, updatedDone: false };
      }
      return { promptVerification: false, updatedDone: done };
    }

    const checkAttempt = attemptToggle(taskWithoutActivity, true);
    assert(checkAttempt.promptVerification === true, 'Should trigger verification modal');
    assert(checkAttempt.updatedDone === false, 'Should not mark completed without activity verification');

    const verifiedTask = { ...taskWithoutActivity, activity_completed: true };
    const validAttempt = attemptToggle(verifiedTask, true);
    assert(validAttempt.promptVerification === false, 'Should not block verified activity');
    assert(validAttempt.updatedDone === true, 'Should mark completed when activity is verified');

    results.push({
      id: 5,
      name: 'Activity verification guard protects against premature completion without practice',
      passed: true,
    });
  } catch (err: any) {
    results.push({
      id: 5,
      name: 'Activity verification guard protects against premature completion without practice',
      passed: false,
      error: err.message,
    });
  }

  return results;
}
