/**
 * MindMate — Demo Learner Dataset & Isolated Demo Mode
 *
 * Provides a realistic, coherent 14-day sample learning history for demonstrations
 * (specifically for learner `meet8kotecha` or any evaluator), while completely isolating
 * demo attempts from genuine real learner records.
 */

import type { AttemptRecord } from '../assessment/types';
import type { PlannerTaskData, QuizSessionPayload } from '../../lib/db';
import { ANALYTICS_UPDATED_EVENT } from '../assessment/assessmentService';

const DEMO_ACTIVE_GLOBAL_KEY = 'mindmate_demo_active';
const DEMO_ATTEMPTS_PREFIX = 'mindmate_demo_attempts_';
const DEMO_PLANNER_PREFIX = 'mindmate_demo_planner_';
const DEMO_SESSIONS_PREFIX = 'mindmate_demo_sessions_';

export const DEMO_MODE_CHANGED_EVENT = 'mindmate-demo-mode-changed';

function getEffectiveKey(prefix: string, userId?: string | null): string {
  const normalized = (userId || 'meet8kotecha').trim();
  return `${prefix}${normalized}`;
}

export function isDemoModeActive(userId?: string | null): boolean {
  if (typeof localStorage === 'undefined') return false;
  const userKey = getEffectiveKey('mindmate_demo_active_', userId);
  return (
    localStorage.getItem(userKey) === 'true' ||
    localStorage.getItem(DEMO_ACTIVE_GLOBAL_KEY) === 'true'
  );
}

export function setDemoModeActive(active: boolean, userId?: string | null): void {
  if (typeof localStorage === 'undefined') return;
  const effectiveId = (userId || 'meet8kotecha').trim();
  const userKey = getEffectiveKey('mindmate_demo_active_', effectiveId);

  if (active) {
    localStorage.setItem(userKey, 'true');
    localStorage.setItem(DEMO_ACTIVE_GLOBAL_KEY, 'true');
  } else {
    localStorage.removeItem(userKey);
    localStorage.removeItem(DEMO_ACTIVE_GLOBAL_KEY);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(DEMO_MODE_CHANGED_EVENT, { detail: { active, userId: effectiveId } })
    );
    window.dispatchEvent(
      new CustomEvent(ANALYTICS_UPDATED_EVENT, { detail: { userId: effectiveId } })
    );
  }
}

/**
 * Generate a realistic 14-day chronological attempt log across the 8 curriculum topics:
 * - Python Variables (strong, 100% accuracy, high confidence)
 * - Loops & Iteration (strong, 86% accuracy, high confidence)
 * - Python Functions (developing -> strong after follow-up practice, 83% accuracy)
 * - Object-Oriented Programming (weak focus, 40% accuracy, repeated mistakes on MRO)
 * - SQL (developing, 80% accuracy)
 * - Database Normalization (weak focus, 25% accuracy, 2NF/3NF/BCNF gaps)
 * - Stacks & Queues (developing / strong, 80% accuracy)
 * - Trees & Graphs (developing baseline, 67% accuracy)
 */
export function generateRealisticDemoAttempts(userId: string = 'meet8kotecha'): AttemptRecord[] {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const dateAt = (daysAgo: number, hoursOffset = 10, minutesOffset = 30) => {
    const d = new Date(now - daysAgo * DAY_MS);
    d.setHours(hoursOffset, minutesOffset, 0, 0);
    return d.toISOString();
  };

  const attempts: AttemptRecord[] = [
    // --------------------------------------------------------------------------
    // DAY -13: Python Variables & Scope (Diagnostic baseline)
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-01',
      client_attempt_id: 'demo-client-01',
      user_id: userId,
      quiz_id: 'quiz-python-variables-diag',
      attempt_type: 'diagnostic',
      session_id: 'demo-session-day13-diag',
      subject_id: 'python',
      topic_id: 'python-variables',
      topic_name: 'Variables & Scope',
      concept_tag: 'variable-binding',
      difficulty: 1,
      question_id: 'q-var-01',
      question_text: 'In Python, what happens when you assign a variable `x = 10`?',
      options: [
        'An integer object with value 10 is created and x references it',
        'Memory for an integer is allocated statically at compile-time',
        'x becomes a pointer to a C-style array',
        'The variable type is permanently locked to int',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'In Python, variables are named references bound to objects in heap memory.',
      response_duration_ms: 12400,
      resolved: true,
      attempted_at: dateAt(13, 10, 15),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-02',
      client_attempt_id: 'demo-client-02',
      user_id: userId,
      quiz_id: 'quiz-python-variables-diag',
      attempt_type: 'diagnostic',
      session_id: 'demo-session-day13-diag',
      subject_id: 'python',
      topic_id: 'python-variables',
      topic_name: 'Variables & Scope',
      concept_tag: 'lebg-scope',
      difficulty: 2,
      question_id: 'q-var-02',
      question_text: 'What order does Python follow when resolving names under the LEGB rule?',
      options: [
        'Local, Enclosing, Global, Built-in',
        'Literal, Expression, Global, Block',
        'Local, External, General, Binary',
        'Lexical, Environment, Global, Base',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Python resolves identifiers following the LEGB order: Local -> Enclosing -> Global -> Built-in.',
      response_duration_ms: 14200,
      resolved: true,
      attempted_at: dateAt(13, 10, 20),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -12: Loops & Iteration (Diagnostic & generator syntax)
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-03',
      client_attempt_id: 'demo-client-03',
      user_id: userId,
      quiz_id: 'quiz-python-loops-diag',
      attempt_type: 'diagnostic',
      session_id: 'demo-session-day12-diag',
      subject_id: 'python',
      topic_id: 'python-loops',
      topic_name: 'Loops & Iteration',
      concept_tag: 'for-while-loops',
      difficulty: 1,
      question_id: 'q-loop-01',
      question_text: 'What is the primary difference between a `for` loop and a `while` loop in Python?',
      options: [
        '`for` iterates over an iterable, while `while` repeats until a boolean condition is false',
        '`while` loops cannot be exited with `break`',
        '`for` loops are strictly for numerical indexing',
        '`while` loops cannot have an `else` block',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Python `for` loops iterate over iterables using the iterator protocol.',
      response_duration_ms: 9800,
      resolved: true,
      attempted_at: dateAt(12, 11, 5),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-04',
      client_attempt_id: 'demo-client-04',
      user_id: userId,
      quiz_id: 'quiz-python-loops-diag',
      attempt_type: 'diagnostic',
      session_id: 'demo-session-day12-diag',
      subject_id: 'python',
      topic_id: 'python-loops',
      topic_name: 'Loops & Iteration',
      concept_tag: 'generators-iterators',
      difficulty: 3,
      question_id: 'q-loop-02',
      question_text: 'What object is returned when evaluating `(x * 2 for x in range(5))`?',
      options: [
        'A generator expression object (evaluated lazily on demand)',
        'A tuple containing doubled values',
        'A list in memory',
        'A set of doubled integers',
      ],
      selected_option: 1, // Mistake! Selected tuple instead of generator
      correct_option: 0,
      is_correct: false,
      explanation: 'Parentheses around a comprehension syntax create a generator object, not a tuple.',
      response_duration_ms: 22100,
      resolved: true, // Resolved later in follow-up
      attempted_at: dateAt(12, 11, 12),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -11: SQL & Query Optimization (Filtering and basic joins)
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-05',
      client_attempt_id: 'demo-client-05',
      user_id: userId,
      quiz_id: 'quiz-dbms-sql-01',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day11',
      subject_id: 'dbms',
      topic_id: 'dbms-sql',
      topic_name: 'SQL & Query Optimization',
      concept_tag: 'sql-filtering-aggregation',
      difficulty: 1,
      question_id: 'q-sql-01',
      question_text: 'Which SQL keyword is used to remove duplicate rows from a query result set?',
      options: ['DISTINCT', 'UNIQUE', 'DIFFERENT', 'DISCRETE'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: '`SELECT DISTINCT` filters out identical rows from the result set.',
      response_duration_ms: 8400,
      resolved: true,
      attempted_at: dateAt(11, 14, 20),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-06',
      client_attempt_id: 'demo-client-06',
      user_id: userId,
      quiz_id: 'quiz-dbms-sql-01',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day11',
      subject_id: 'dbms',
      topic_id: 'dbms-sql',
      topic_name: 'SQL & Query Optimization',
      concept_tag: 'joins',
      difficulty: 2,
      question_id: 'q-sql-02',
      question_text: 'What does an `INNER JOIN` between tables A and B return?',
      options: [
        'Only matching rows where the join predicate evaluates to TRUE for both tables',
        'All rows from A and only matching rows from B',
        'All rows from B and matching rows from A',
        'The Cartesian product of A and B',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'An INNER JOIN filters out non-matching rows from both inputs.',
      response_duration_ms: 11000,
      resolved: true,
      attempted_at: dateAt(11, 14, 28),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -10: Python Functions & Stacks (Arguments & LIFO complexity)
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-07',
      client_attempt_id: 'demo-client-07',
      user_id: userId,
      quiz_id: 'quiz-python-fn-01',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day10',
      subject_id: 'python',
      topic_id: 'python-functions',
      topic_name: 'Python Functions',
      concept_tag: 'arguments-packing',
      difficulty: 2,
      question_id: 'q-fn-01',
      question_text: 'In a function signature `def fn(*args, **kwargs):`, what are the types of `args` and `kwargs`?',
      options: [
        '`args` is a tuple, `kwargs` is a dictionary',
        '`args` is a list, `kwargs` is a dictionary',
        '`args` is a set, `kwargs` is a tuple',
        'Both are dictionaries',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Positional variadic arguments pack into a tuple; keyword variadic arguments pack into a dict.',
      response_duration_ms: 10500,
      resolved: true,
      attempted_at: dateAt(10, 16, 10),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-08',
      client_attempt_id: 'demo-client-08',
      user_id: userId,
      quiz_id: 'quiz-dsa-stacks-01',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day10',
      subject_id: 'dsa',
      topic_id: 'dsa-queues-stacks',
      topic_name: 'Stacks & Queues',
      concept_tag: 'lifo-stack',
      difficulty: 1,
      question_id: 'q-stack-01',
      question_text: 'What principle governs a standard stack data structure?',
      options: [
        'LIFO (Last-In, First-Out)',
        'FIFO (First-In, First-Out)',
        'LILO (Last-In, Last-Out)',
        'Random access lookup',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Stacks operate strictly under Last-In, First-Out semantics.',
      response_duration_ms: 6500,
      resolved: true,
      attempted_at: dateAt(10, 16, 25),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -9: Python Variables & OOP Introduction
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-09',
      client_attempt_id: 'demo-client-09',
      user_id: userId,
      quiz_id: 'quiz-python-var-02',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day09',
      subject_id: 'python',
      topic_id: 'python-variables',
      topic_name: 'Variables & Scope',
      concept_tag: 'mutability',
      difficulty: 2,
      question_id: 'q-var-03',
      question_text: 'Which of the following built-in Python types is immutable?',
      options: ['tuple', 'list', 'set', 'dictionary'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Tuples, strings, and integers are immutable in Python.',
      response_duration_ms: 8200,
      resolved: true,
      attempted_at: dateAt(9, 10, 10),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-10',
      client_attempt_id: 'demo-client-10',
      user_id: userId,
      quiz_id: 'quiz-python-oop-01',
      attempt_type: 'diagnostic',
      session_id: 'demo-session-day09',
      subject_id: 'python',
      topic_id: 'python-oop',
      topic_name: 'Object-Oriented Programming (OOP)',
      concept_tag: 'constructors-init',
      difficulty: 2,
      question_id: 'q-oop-01',
      question_text: 'What role does `__init__` play in a Python class definition?',
      options: [
        'It initializes instance attributes immediately after object allocation',
        'It allocates raw operating system memory for the object',
        'It acts as the class destructor',
        'It converts the class into a singleton',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: '`__new__` allocates the instance, while `__init__` initializes its state.',
      response_duration_ms: 13100,
      resolved: true,
      attempted_at: dateAt(9, 10, 30),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -8: Python Functions (Mistake on mutable default) & SQL Aggregation
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-11',
      client_attempt_id: 'demo-client-11',
      user_id: userId,
      quiz_id: 'quiz-python-fn-02',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day08',
      subject_id: 'python',
      topic_id: 'python-functions',
      topic_name: 'Python Functions',
      concept_tag: 'mutable-defaults',
      difficulty: 3,
      question_id: 'q-fn-02',
      question_text: 'What happens when defining `def append_item(val, items=[]):` in Python?',
      options: [
        'The default list is bound at function definition time and shared across all invocations',
        'A fresh list is allocated each time the function is called without arguments',
        'Python raises a SyntaxError at compile time',
        'The parameter is treated as an immutable tuple',
      ],
      selected_option: 1, // Mistake! Common beginner/intermediate trap
      correct_option: 0,
      is_correct: false,
      explanation: 'Default parameter values in Python are evaluated once when the function is defined, making mutable defaults shared state.',
      response_duration_ms: 24000,
      resolved: true, // Fixed in Day -3 follow-up!
      attempted_at: dateAt(8, 14, 15),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-12',
      client_attempt_id: 'demo-client-12',
      user_id: userId,
      quiz_id: 'quiz-dbms-sql-02',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day08',
      subject_id: 'dbms',
      topic_id: 'dbms-sql',
      topic_name: 'SQL & Query Optimization',
      concept_tag: 'sql-filtering-aggregation',
      difficulty: 2,
      question_id: 'q-sql-03',
      question_text: 'Which clause must be used to filter groups created by `GROUP BY` based on aggregate conditions?',
      options: ['HAVING', 'WHERE', 'FILTER BY', 'QUALIFY'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: '`WHERE` filters individual rows prior to grouping; `HAVING` filters aggregated groups.',
      response_duration_ms: 9200,
      resolved: true,
      attempted_at: dateAt(8, 14, 35),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -7: Loops Comprehensions & Normalization Intro
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-13',
      client_attempt_id: 'demo-client-13',
      user_id: userId,
      quiz_id: 'quiz-python-loops-02',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day07',
      subject_id: 'python',
      topic_id: 'python-loops',
      topic_name: 'Loops & Iteration',
      concept_tag: 'comprehensions',
      difficulty: 2,
      question_id: 'q-loop-03',
      question_text: 'Which comprehension produces `{0: 0, 1: 1, 2: 4, 3: 9}`?',
      options: [
        '`{x: x**2 for x in range(4)}`',
        '`[x: x**2 for x in range(4)]`',
        '`(x, x**2 for x in range(4))`',
        '`dict([x**2 for x in range(4)])`',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Dict comprehensions use curly braces with key: value syntax.',
      response_duration_ms: 11500,
      resolved: true,
      attempted_at: dateAt(7, 11, 0),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-14',
      client_attempt_id: 'demo-client-14',
      user_id: userId,
      quiz_id: 'quiz-dbms-norm-01',
      attempt_type: 'diagnostic',
      session_id: 'demo-session-day07',
      subject_id: 'dbms',
      topic_id: 'dbms-normalization',
      topic_name: 'Database Normalization',
      concept_tag: 'normal-forms',
      difficulty: 2,
      question_id: 'q-norm-01',
      question_text: 'What fundamental constraint is required for a relation to satisfy First Normal Form (1NF)?',
      options: [
        'Every attribute must hold atomic (indivisible) values and rows must be unique',
        'All transitive functional dependencies must be eliminated',
        'Every non-key attribute must depend on the primary key via BCNF',
        'Foreign key indexes must be defined on all tables',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: '1NF requires scalar, atomic attribute values without repeating groups.',
      response_duration_ms: 12800,
      resolved: true,
      attempted_at: dateAt(7, 11, 20),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -6: Closures & Circular Queues
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-15',
      client_attempt_id: 'demo-client-15',
      user_id: userId,
      quiz_id: 'quiz-python-fn-03',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day06',
      subject_id: 'python',
      topic_id: 'python-functions',
      topic_name: 'Python Functions',
      concept_tag: 'closures-scope',
      difficulty: 3,
      question_id: 'q-fn-03',
      question_text: 'What enables a closure to retain access to variables in its enclosing scope after the outer function finishes executing?',
      options: [
        'The function object stores references to free variables in its `__closure__` cell objects',
        'The Python interpreter copies enclosing variables into `globals()`',
        'Enclosing variables are serialized into the bytecode cache file (.pyc)',
        'Variables are promoted to class attributes',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Python closures bind free variables through cell objects stored in the `__closure__` attribute.',
      response_duration_ms: 15400,
      resolved: true,
      attempted_at: dateAt(6, 15, 30),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-16',
      client_attempt_id: 'demo-client-16',
      user_id: userId,
      quiz_id: 'quiz-dsa-queues-02',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day06',
      subject_id: 'dsa',
      topic_id: 'dsa-queues-stacks',
      topic_name: 'Stacks & Queues',
      concept_tag: 'fifo-queue',
      difficulty: 3,
      question_id: 'q-queue-01',
      question_text: 'In a circular queue implemented using a fixed-size array of capacity N, how is the next tail index computed?',
      options: [
        '`(tail + 1) % N`',
        '`(tail + 1) / N`',
        '`tail + N`',
        '`min(tail + 1, N)`',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Modulo arithmetic wraps the tail pointer back to index 0 when it exceeds array bounds.',
      response_duration_ms: 10900,
      resolved: true,
      attempted_at: dateAt(6, 15, 50),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -5: OOP MRO Mistake #1 & Database Normalization 2NF/3NF Mistake
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-17',
      client_attempt_id: 'demo-client-17',
      user_id: userId,
      quiz_id: 'quiz-python-oop-02',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day05',
      subject_id: 'python',
      topic_id: 'python-oop',
      topic_name: 'Object-Oriented Programming (OOP)',
      concept_tag: 'inheritance-mro',
      difficulty: 4,
      question_id: 'q-oop-02',
      question_text: 'Given diamond inheritance `class D(B, C): pass` where `B(A)` and `C(A)`, what order does `super()` call methods?',
      options: [
        'D -> B -> C -> A -> object (C3 Linearization)',
        'D -> B -> A -> C -> object (Depth-first left-to-right)',
        'D -> C -> B -> A -> object',
        'D -> A -> B -> C -> object',
      ],
      selected_option: 1, // Mistake #1 on inheritance-mro!
      correct_option: 0,
      is_correct: false,
      explanation: 'Python uses C3 Linearization to guarantee that base classes appear after derived classes and preserve local precedence.',
      response_duration_ms: 26000,
      resolved: false, // Remains unresolved recurring error!
      attempted_at: dateAt(5, 17, 10),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-18',
      client_attempt_id: 'demo-client-18',
      user_id: userId,
      quiz_id: 'quiz-dbms-norm-02',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day05',
      subject_id: 'dbms',
      topic_id: 'dbms-normalization',
      topic_name: 'Database Normalization',
      concept_tag: 'functional-dependencies',
      difficulty: 3,
      question_id: 'q-norm-02',
      question_text: 'What distinguishes Third Normal Form (3NF) from Second Normal Form (2NF)?',
      options: [
        '3NF forbids transitive dependencies of non-prime attributes on candidate keys',
        '3NF requires all multivalued dependencies to be trivial',
        '3NF allows composite keys without full functional dependency',
        '3NF only applies to NoSQL document schemas',
      ],
      selected_option: 2, // Mistake on functional dependencies!
      correct_option: 0,
      is_correct: false,
      explanation: '2NF removes partial key dependencies; 3NF removes transitive dependencies (X -> Y and Y -> Z where Z is non-prime).',
      response_duration_ms: 21500,
      resolved: false,
      attempted_at: dateAt(5, 17, 30),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -4: OOP MRO Mistake #2 (Repeated mistake pattern) & SQL JOIN trap
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-19',
      client_attempt_id: 'demo-client-19',
      user_id: userId,
      quiz_id: 'quiz-python-oop-03',
      attempt_type: 'follow_up',
      session_id: 'demo-session-day04',
      subject_id: 'python',
      topic_id: 'python-oop',
      topic_name: 'Object-Oriented Programming (OOP)',
      concept_tag: 'inheritance-mro',
      difficulty: 4,
      question_id: 'q-oop-03',
      question_text: 'What exception is raised if multiple inheritance defines inconsistent method resolution order (e.g. `class X(A, B)` and `class Y(B, A)` then `class Z(X, Y)`)?',
      options: [
        '`TypeError: Cannot create a consistent method resolution order (MRO)`',
        '`RecursionError: Maximum inheritance depth exceeded`',
        '`SyntaxError: Ambiguous base classes`',
        '`AttributeError: Multiple definitions of __init__`',
      ],
      selected_option: 2, // Mistake #2 on inheritance-mro! Detects recurring mistake pattern!
      correct_option: 0,
      is_correct: false,
      explanation: 'Python verifies monotonic C3 linearization at class definition time and raises TypeError if a linear ordering is impossible.',
      response_duration_ms: 28500,
      resolved: false,
      attempted_at: dateAt(4, 11, 15),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-20',
      client_attempt_id: 'demo-client-20',
      user_id: userId,
      quiz_id: 'quiz-dbms-sql-03',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day04',
      subject_id: 'dbms',
      topic_id: 'dbms-sql',
      topic_name: 'SQL & Query Optimization',
      concept_tag: 'joins',
      difficulty: 3,
      question_id: 'q-sql-04',
      question_text: 'In `SELECT * FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.amount > 100`, how does the `WHERE` clause affect the `LEFT JOIN`?',
      options: [
        'It converts the query behavior into an effective INNER JOIN because NULL orders are filtered out by `o.amount > 100`',
        'It preserves all users regardless of order existence and substitutes 0 for NULLs',
        'It causes a syntax error because LEFT JOIN cannot have a WHERE clause',
        'It groups orders by user id automatically',
      ],
      selected_option: 1, // Common SQL mistake
      correct_option: 0,
      is_correct: false,
      explanation: 'A WHERE predicate on the right table of a LEFT JOIN filters out null-padded rows, converting the join into an inner join.',
      response_duration_ms: 23000,
      resolved: true, // Fixed in Day -2
      attempted_at: dateAt(4, 11, 40),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-21',
      client_attempt_id: 'demo-client-21',
      user_id: userId,
      quiz_id: 'quiz-dsa-trees-01',
      attempt_type: 'diagnostic',
      session_id: 'demo-session-day04',
      subject_id: 'dsa',
      topic_id: 'dsa-trees',
      topic_name: 'Trees & Graphs',
      concept_tag: 'bst-properties',
      difficulty: 2,
      question_id: 'q-tree-01',
      question_text: 'Which tree traversal algorithm visits nodes of a valid Binary Search Tree (BST) in strictly ascending sorted order?',
      options: ['In-order traversal', 'Pre-order traversal', 'Post-order traversal', 'Breadth-First Search (BFS)'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'In-order traversal visits (Left, Root, Right), which outputs keys in ascending order for any BST.',
      response_duration_ms: 9500,
      resolved: true,
      attempted_at: dateAt(4, 12, 10),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-22',
      client_attempt_id: 'demo-client-22',
      user_id: userId,
      quiz_id: 'quiz-python-var-03',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day04',
      subject_id: 'python',
      topic_id: 'python-variables',
      topic_name: 'Variables & Scope',
      concept_tag: 'lebg-scope',
      difficulty: 3,
      question_id: 'q-var-04',
      question_text: 'Which keyword allows an inner function to rebind a variable declared in the immediately enclosing function scope?',
      options: ['nonlocal', 'global', 'outer', 'super'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: '`nonlocal` declares that an identifier refers to previously bound variables in the nearest enclosing scope.',
      response_duration_ms: 11000,
      resolved: true,
      attempted_at: dateAt(4, 12, 30),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -3: Follow-Up Success on Functions & Normalization BCNF gap
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-23',
      client_attempt_id: 'demo-client-23',
      user_id: userId,
      quiz_id: 'quiz-python-fn-followup',
      attempt_type: 'follow_up',
      session_id: 'demo-session-day03-recovery',
      subject_id: 'python',
      topic_id: 'python-functions',
      topic_name: 'Python Functions',
      concept_tag: 'mutable-defaults',
      difficulty: 3,
      question_id: 'q-fn-04',
      question_text: 'What is the idiomatic Python pattern for default argument values that should be mutable lists or dicts?',
      options: [
        'Use `default=None` and initialize with `if default is None: default = []` inside the body',
        'Use `default=list()` in the parameter list',
        'Pass `copy.deepcopy()` in the function declaration header',
        'Wrap the default argument in `tuple()`',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true, // Improvement verified! Conquered previous mutable default error!
      explanation: 'Using `None` as a sentinel value ensures a distinct mutable instance is allocated for each call.',
      response_duration_ms: 13200,
      resolved: true,
      attempted_at: dateAt(3, 14, 10),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-24',
      client_attempt_id: 'demo-client-24',
      user_id: userId,
      quiz_id: 'quiz-dbms-norm-03',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day03',
      subject_id: 'dbms',
      topic_id: 'dbms-normalization',
      topic_name: 'Database Normalization',
      concept_tag: 'bcnf-decomposition',
      difficulty: 4,
      question_id: 'q-norm-03',
      question_text: 'Under Boyce-Codd Normal Form (BCNF), for every non-trivial functional dependency X -> Y, what must X be?',
      options: [
        'A superkey',
        'A prime attribute',
        'A foreign key',
        'An indexed column',
      ],
      selected_option: 1, // Mistake on BCNF superkey condition!
      correct_option: 0,
      is_correct: false,
      explanation: 'BCNF requires that every determinant X in a non-trivial functional dependency must be a superkey.',
      response_duration_ms: 25400,
      resolved: false,
      attempted_at: dateAt(3, 14, 35),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-25',
      client_attempt_id: 'demo-client-25',
      user_id: userId,
      quiz_id: 'quiz-dsa-stacks-02',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day03',
      subject_id: 'dsa',
      topic_id: 'dsa-queues-stacks',
      topic_name: 'Stacks & Queues',
      concept_tag: 'deque-complexity',
      difficulty: 4,
      question_id: 'q-stack-02',
      question_text: 'What data structure is optimal for implementing a monotonic stack to find the Next Greater Element in O(N) total time?',
      options: [
        'A standard stack storing indices with monotonic invariant ordering',
        'A binary search tree',
        'A priority queue / min-heap',
        'A doubly linked hash map',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Monotonic stacks process each element at most twice (one push, one pop) yielding linear O(N) runtime.',
      response_duration_ms: 14800,
      resolved: true,
      attempted_at: dateAt(3, 15, 0),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -2: SQL Follow-Up Recovery, Loops Boundary, Trees BFS Mistake
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-26',
      client_attempt_id: 'demo-client-26',
      user_id: userId,
      quiz_id: 'quiz-dbms-sql-recovery',
      attempt_type: 'follow_up',
      session_id: 'demo-session-day02-recovery',
      subject_id: 'dbms',
      topic_id: 'dbms-sql',
      topic_name: 'SQL & Query Optimization',
      concept_tag: 'joins',
      difficulty: 3,
      question_id: 'q-sql-05',
      question_text: 'How should you write a query to return all customers and their orders, but only include orders placed in 2026, without dropping customers who have no orders?',
      options: [
        'Put the year condition in the `ON` clause of the `LEFT JOIN` (e.g. `ON c.id = o.cust_id AND o.year = 2026`)',
        'Put `WHERE o.year = 2026` at the end of the query',
        'Use an `INNER JOIN` with `HAVING year = 2026`',
        'Use a `CROSS JOIN` followed by `DISTINCT`',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true, // Improvement verified on SQL joins!
      explanation: 'Filtering in the LEFT JOIN ON clause filters matching rows before null padding, preserving non-matching left rows.',
      response_duration_ms: 16200,
      resolved: true,
      attempted_at: dateAt(2, 16, 10),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-27',
      client_attempt_id: 'demo-client-27',
      user_id: userId,
      quiz_id: 'quiz-python-loops-03',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day02',
      subject_id: 'python',
      topic_id: 'python-loops',
      topic_name: 'Loops & Iteration',
      concept_tag: 'for-while-loops',
      difficulty: 4,
      question_id: 'q-loop-04',
      question_text: 'When does the `else` block of a Python `while` loop execute?',
      options: [
        'When the loop terminates naturally because the condition became false (not via `break`)',
        'Whenever an exception occurs inside the loop body',
        'Only if the loop body executed zero iterations',
        'Immediately after a `break` statement',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Python loop `else` clauses run upon normal termination of the loop condition, bypassed by `break`.',
      response_duration_ms: 12000,
      resolved: true,
      attempted_at: dateAt(2, 16, 30),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-28',
      client_attempt_id: 'demo-client-28',
      user_id: userId,
      quiz_id: 'quiz-dsa-trees-02',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day02',
      subject_id: 'dsa',
      topic_id: 'dsa-trees',
      topic_name: 'Trees & Graphs',
      concept_tag: 'tree-traversal',
      difficulty: 3,
      question_id: 'q-tree-02',
      question_text: 'In level-order traversal (BFS) of a binary tree, how do you demarcate separate levels in a queue?',
      options: [
        'Snapshot the queue length at the start of each level loop',
        'Insert a null sentinel after every node push',
        'Use two separate recursion stacks',
        'Reset the queue to empty after each node',
      ],
      selected_option: 1, // Mistake
      correct_option: 0,
      is_correct: false,
      explanation: 'Taking `level_size = len(queue)` processes exactly the nodes for the current depth before new children expand.',
      response_duration_ms: 19800,
      resolved: false,
      attempted_at: dateAt(2, 16, 50),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // DAY -1: OOP Encapsulation Mistake & Trees BST Height
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-29',
      client_attempt_id: 'demo-client-29',
      user_id: userId,
      quiz_id: 'quiz-python-oop-04',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day01',
      subject_id: 'python',
      topic_id: 'python-oop',
      topic_name: 'Object-Oriented Programming (OOP)',
      concept_tag: 'encapsulation',
      difficulty: 3,
      question_id: 'q-oop-04',
      question_text: 'In Python, what mechanism does the interpreter use when an attribute is prefixed with two leading underscores (e.g. `__secret`)?',
      options: [
        'Name mangling (transforms name to `_ClassName__secret`)',
        'Strict hardware-enforced private access control that raises AccessDeniedError',
        'Memory encryption of the attribute pointer',
        'Makes the attribute read-only',
      ],
      selected_option: 1, // Mistake
      correct_option: 0,
      is_correct: false,
      explanation: 'Python uses name mangling to prevent accidental name collisions in subclasses, not hard runtime security.',
      response_duration_ms: 18200,
      resolved: false,
      attempted_at: dateAt(1, 10, 15),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-30',
      client_attempt_id: 'demo-client-30',
      user_id: userId,
      quiz_id: 'quiz-dsa-trees-03',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day01',
      subject_id: 'dsa',
      topic_id: 'dsa-trees',
      topic_name: 'Trees & Graphs',
      concept_tag: 'bst-properties',
      difficulty: 3,
      question_id: 'q-tree-03',
      question_text: 'What is the worst-case time complexity of searching in an unbalanced Binary Search Tree of N nodes?',
      options: ['O(N)', 'O(log N)', 'O(1)', 'O(N log N)'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'When a BST degenerates into a linear linked list (e.g. sorted insertions), search degrades to O(N).',
      response_duration_ms: 10200,
      resolved: true,
      attempted_at: dateAt(1, 10, 35),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-31',
      client_attempt_id: 'demo-client-31',
      user_id: userId,
      quiz_id: 'quiz-python-loops-04',
      attempt_type: 'adaptive',
      session_id: 'demo-session-day01',
      subject_id: 'python',
      topic_id: 'python-loops',
      topic_name: 'Loops & Iteration',
      concept_tag: 'generators-iterators',
      difficulty: 3,
      question_id: 'q-loop-05',
      question_text: 'What built-in function advances an iterator to its next item or returns a default value?',
      options: ['next(iterator[, default])', 'advance()', 'step()', 'yield()'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: '`next()` invokes the `__next__()` dunder method on the iterator.',
      response_duration_ms: 8900,
      resolved: true,
      attempted_at: dateAt(1, 10, 50),
      persistence_source: 'local',
    },

    // --------------------------------------------------------------------------
    // TODAY: Recent Practice Session (Variables Mastery & OOP Retry Practice)
    // --------------------------------------------------------------------------
    {
      id: 'demo-att-32',
      client_attempt_id: 'demo-client-32',
      user_id: userId,
      quiz_id: 'quiz-python-var-mastery',
      attempt_type: 'adaptive',
      session_id: 'demo-session-today',
      subject_id: 'python',
      topic_id: 'python-variables',
      topic_name: 'Variables & Scope',
      concept_tag: 'variable-binding',
      difficulty: 4,
      question_id: 'q-var-05',
      question_text: 'What is the result of `a = [1]; b = a; b += [2]; print(a)` in Python?',
      options: ['[1, 2]', '[1]', 'TypeError', '[2]'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'In-place `+=` on a list calls `__iadd__`, mutating the original list in place so `a` reflects the change.',
      response_duration_ms: 11400,
      resolved: true,
      attempted_at: dateAt(0, 9, 30),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-33',
      client_attempt_id: 'demo-client-33',
      user_id: userId,
      quiz_id: 'quiz-python-var-mastery',
      attempt_type: 'adaptive',
      session_id: 'demo-session-today',
      subject_id: 'python',
      topic_id: 'python-variables',
      topic_name: 'Variables & Scope',
      concept_tag: 'mutability',
      difficulty: 3,
      question_id: 'q-var-06',
      question_text: 'What built-in function returns the unique integer identity address of a Python object?',
      options: ['id()', 'hash()', 'pointer()', 'ref()'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: '`id(obj)` returns the memory address of the object in CPython.',
      response_duration_ms: 7800,
      resolved: true,
      attempted_at: dateAt(0, 9, 45),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-34',
      client_attempt_id: 'demo-client-34',
      user_id: userId,
      quiz_id: 'quiz-python-oop-today',
      attempt_type: 'adaptive',
      session_id: 'demo-session-today',
      subject_id: 'python',
      topic_id: 'python-oop',
      topic_name: 'Object-Oriented Programming (OOP)',
      concept_tag: 'instance-self',
      difficulty: 2,
      question_id: 'q-oop-05',
      question_text: 'What does the first parameter (traditionally named `self`) represent in an instance method?',
      options: [
        'The specific instance of the class upon which the method was called',
        'A reference to the parent metaclass',
        'A copy of the class namespace dictionary',
        'A global application context',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: '`self` explicitly passes the instance reference to instance methods in Python.',
      response_duration_ms: 9100,
      resolved: true,
      attempted_at: dateAt(0, 10, 10),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-35',
      client_attempt_id: 'demo-client-35',
      user_id: userId,
      quiz_id: 'quiz-dbms-sql-today',
      attempt_type: 'adaptive',
      session_id: 'demo-session-today',
      subject_id: 'dbms',
      topic_id: 'dbms-sql',
      topic_name: 'SQL & Query Optimization',
      concept_tag: 'indexing-query-plans',
      difficulty: 3,
      question_id: 'q-sql-06',
      question_text: 'Which index structure is the default in PostgreSQL for equality and range queries?',
      options: ['B-Tree index', 'Hash index', 'GIN index', 'BRIN index'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'B-Tree is the default index structure supporting `<, <=, =, >=, >` operators efficiently.',
      response_duration_ms: 8800,
      resolved: true,
      attempted_at: dateAt(0, 10, 25),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-36',
      client_attempt_id: 'demo-client-36',
      user_id: userId,
      quiz_id: 'quiz-python-fn-today',
      attempt_type: 'adaptive',
      session_id: 'demo-session-today',
      subject_id: 'python',
      topic_id: 'python-functions',
      topic_name: 'Python Functions',
      concept_tag: 'function-definition',
      difficulty: 2,
      question_id: 'q-fn-05',
      question_text: 'Which built-in module provides higher-order functions like `partial`, `reduce`, and `lru_cache`?',
      options: ['functools', 'itertools', 'operator', 'typing'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'The `functools` standard library module provides utilities for higher-order functions and decorators.',
      response_duration_ms: 7200,
      resolved: true,
      attempted_at: dateAt(0, 10, 40),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-37',
      client_attempt_id: 'demo-client-37',
      user_id: userId,
      quiz_id: 'quiz-dsa-queues-today',
      attempt_type: 'adaptive',
      session_id: 'demo-session-today',
      subject_id: 'dsa',
      topic_id: 'dsa-queues-stacks',
      topic_name: 'Stacks & Queues',
      concept_tag: 'deque-complexity',
      difficulty: 2,
      question_id: 'q-queue-03',
      question_text: 'What standard Python collection provides O(1) appends and pops from both ends?',
      options: ['collections.deque', 'list', 'queue.PriorityQueue', 'array.array'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: '`collections.deque` is implemented as a doubly linked list of fixed-size blocks, ensuring O(1) operations at either end.',
      response_duration_ms: 8100,
      resolved: true,
      attempted_at: dateAt(0, 11, 0),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-38',
      client_attempt_id: 'demo-client-38',
      user_id: userId,
      quiz_id: 'quiz-python-loops-today',
      attempt_type: 'adaptive',
      session_id: 'demo-session-today',
      subject_id: 'python',
      topic_id: 'python-loops',
      topic_name: 'Loops & Iteration',
      concept_tag: 'for-while-loops',
      difficulty: 2,
      question_id: 'q-loop-06',
      question_text: 'Which built-in function pairs each element of an iterable with an automatic index counter?',
      options: ['enumerate()', 'zip()', 'counter()', 'range()'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: '`enumerate(iterable, start=0)` yields tuples of (index, value).',
      response_duration_ms: 6100,
      resolved: true,
      attempted_at: dateAt(0, 11, 15),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-39',
      client_attempt_id: 'demo-client-39',
      user_id: userId,
      quiz_id: 'quiz-python-loops-today',
      attempt_type: 'adaptive',
      session_id: 'demo-session-today',
      subject_id: 'python',
      topic_id: 'python-loops',
      topic_name: 'Loops & Iteration',
      concept_tag: 'comprehensions',
      difficulty: 3,
      question_id: 'q-loop-07',
      question_text: 'What is the value of `[x for x in range(10) if x % 3 == 0]`?',
      options: ['[0, 3, 6, 9]', '[3, 6, 9]', '[0, 3, 6]', '[1, 3, 6, 9]'],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: '`range(10)` starts at 0, and `0 % 3 == 0` evaluates to True.',
      response_duration_ms: 7400,
      resolved: true,
      attempted_at: dateAt(0, 11, 25),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-40',
      client_attempt_id: 'demo-client-40',
      user_id: userId,
      quiz_id: 'quiz-python-fn-today',
      attempt_type: 'adaptive',
      session_id: 'demo-session-today',
      subject_id: 'python',
      topic_id: 'python-functions',
      topic_name: 'Python Functions',
      concept_tag: 'arguments-packing',
      difficulty: 3,
      question_id: 'q-fn-06',
      question_text: 'In Python 3.8+, what does the `/` syntax in a function signature like `def f(a, b, /, c):` denote?',
      options: [
        'Parameters before `/` are positional-only',
        'Parameters before `/` are keyword-only',
        'Division is performed automatically',
        'Arguments must be float numbers',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'The `/` marker specifies that preceding parameters must be passed positionally.',
      response_duration_ms: 10400,
      resolved: true,
      attempted_at: dateAt(0, 11, 40),
      persistence_source: 'local',
    },
    {
      id: 'demo-att-41',
      client_attempt_id: 'demo-client-41',
      user_id: userId,
      quiz_id: 'quiz-dbms-norm-today',
      attempt_type: 'adaptive',
      session_id: 'demo-session-today',
      subject_id: 'dbms',
      topic_id: 'dbms-normalization',
      topic_name: 'Database Normalization',
      concept_tag: 'normal-forms',
      difficulty: 3,
      question_id: 'q-norm-04',
      question_text: 'Why might an engineering team deliberately denormalize a relational database in production?',
      options: [
        'To reduce expensive JOIN operations and improve read query latency',
        'To eliminate the need for primary keys',
        'Because SQL databases require 0NF for write scaling',
        'To prevent foreign key constraints from running',
      ],
      selected_option: 0,
      correct_option: 0,
      is_correct: true,
      explanation: 'Controlled denormalization trades storage space and write overhead for faster analytical read query performance.',
      response_duration_ms: 11800,
      resolved: true,
      attempted_at: dateAt(0, 11, 55),
      persistence_source: 'local',
    },
  ];

  return attempts;
}

/**
 * Demo planner tasks reflecting the weaker topics from the demo learning history:
 * OOP recovery, Database Normalization review, SQL practice, Trees practice, and Mock assessment.
 */
export function generateDemoPlannerTasks(userId: string = 'meet8kotecha'): PlannerTaskData[] {
  return [
    {
      id: 'demo-task-01',
      user_id: userId,
      day: 'Mon',
      name: 'OOP Method Resolution Order (MRO) Deep Dive',
      duration: '30 min',
      type: 'recovery',
      priority: 'high',
      completed: false,
      activity_completed: false,
      topic: 'python-oop',
    },
    {
      id: 'demo-task-02',
      user_id: userId,
      day: 'Tue',
      name: 'Database Normalization & BCNF Decomposition',
      duration: '25 min',
      type: 'review',
      priority: 'high',
      completed: false,
      activity_completed: false,
      topic: 'dbms-normalization',
    },
    {
      id: 'demo-task-03',
      user_id: userId,
      day: 'Wed',
      name: 'SQL Join Semantics & Query Optimization',
      duration: '25 min',
      type: 'practice',
      priority: 'medium',
      completed: false,
      activity_completed: false,
      topic: 'dbms-sql',
    },
    {
      id: 'demo-task-04',
      user_id: userId,
      day: 'Thu',
      name: 'Binary Search Trees & Traversal Practice',
      duration: '20 min',
      type: 'practice',
      priority: 'medium',
      completed: false,
      activity_completed: false,
      topic: 'dsa-trees',
    },
    {
      id: 'demo-task-05',
      user_id: userId,
      day: 'Fri',
      name: 'Comprehensive Assessment: Python & Relational DBs',
      duration: '40 min',
      type: 'assessment',
      priority: 'high',
      completed: false,
      activity_completed: false,
      topic: 'python-oop',
    },
    {
      id: 'demo-task-06',
      user_id: userId,
      day: 'Sat',
      name: 'Spaced Repetition: Stacks & Variable Scopes',
      duration: '15 min',
      type: 'practice',
      priority: 'low',
      completed: false,
      activity_completed: false,
      topic: 'dsa-queues-stacks',
    },
  ];
}

/**
 * Demo quiz sessions for Progress and Quiz dashboards.
 */
export function generateDemoQuizSessions(userId: string = 'meet8kotecha'): QuizSessionPayload[] {
  return [
    {
      topic: 'Variables & Scope',
      topic_id: 'python-variables',
      quiz_id: 'quiz-python-var-mastery',
      score: 5,
      total: 5,
      accuracy: 100,
      main_gap: 'None (Solid foundation)',
    },
    {
      topic: 'Loops & Iteration',
      topic_id: 'python-loops',
      quiz_id: 'quiz-python-loops-today',
      score: 6,
      total: 7,
      accuracy: 86,
      main_gap: 'Generator expressions vs tuples',
    },
    {
      topic: 'Python Functions',
      topic_id: 'python-functions',
      quiz_id: 'quiz-python-fn-today',
      score: 5,
      total: 6,
      accuracy: 83,
      main_gap: 'Mutable default argument evaluation',
    },
    {
      topic: 'SQL & Query Optimization',
      topic_id: 'dbms-sql',
      quiz_id: 'quiz-dbms-sql-today',
      score: 4,
      total: 5,
      accuracy: 80,
      main_gap: 'LEFT JOIN WHERE null-filtering trap',
    },
    {
      topic: 'Stacks & Queues',
      topic_id: 'dsa-queues-stacks',
      quiz_id: 'quiz-dsa-queues-today',
      score: 4,
      total: 5,
      accuracy: 80,
      main_gap: 'Circular queue index modulo wrap',
    },
    {
      topic: 'Object-Oriented Programming (OOP)',
      topic_id: 'python-oop',
      quiz_id: 'quiz-python-oop-today',
      score: 2,
      total: 5,
      accuracy: 40,
      main_gap: 'Method Resolution Order (MRO) with super()',
    },
    {
      topic: 'Database Normalization',
      topic_id: 'dbms-normalization',
      quiz_id: 'quiz-dbms-norm-today',
      score: 1,
      total: 4,
      accuracy: 25,
      main_gap: 'Transitive dependencies & BCNF decomposition',
    },
  ];
}

export function getDemoAttempts(userId?: string | null): AttemptRecord[] {
  if (typeof localStorage === 'undefined') {
    return generateRealisticDemoAttempts(userId || 'meet8kotecha');
  }
  const effectiveId = (userId || 'meet8kotecha').trim();
  const storageKey = getEffectiveKey(DEMO_ATTEMPTS_PREFIX, effectiveId);
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // If not yet stored or empty, generate fresh and save
  const generated = generateRealisticDemoAttempts(effectiveId);
  try {
    localStorage.setItem(storageKey, JSON.stringify(generated));
  } catch {}
  return generated;
}

export function saveDemoAttempts(userId: string | null | undefined, attempts: AttemptRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  const effectiveId = (userId || 'meet8kotecha').trim();
  const storageKey = getEffectiveKey(DEMO_ATTEMPTS_PREFIX, effectiveId);
  try {
    localStorage.setItem(storageKey, JSON.stringify(attempts));
  } catch {}
}

export function getDemoPlannerTasks(userId?: string | null): PlannerTaskData[] {
  if (typeof localStorage === 'undefined') {
    return generateDemoPlannerTasks(userId || 'meet8kotecha');
  }
  const effectiveId = (userId || 'meet8kotecha').trim();
  const storageKey = getEffectiveKey(DEMO_PLANNER_PREFIX, effectiveId);
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  const generated = generateDemoPlannerTasks(effectiveId);
  try {
    localStorage.setItem(storageKey, JSON.stringify(generated));
  } catch {}
  return generated;
}

export function saveDemoPlannerTasks(userId: string | null | undefined, tasks: PlannerTaskData[]): void {
  if (typeof localStorage === 'undefined') return;
  const effectiveId = (userId || 'meet8kotecha').trim();
  const storageKey = getEffectiveKey(DEMO_PLANNER_PREFIX, effectiveId);
  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
  } catch {}
}

export function getDemoQuizSessions(userId?: string | null): Array<QuizSessionPayload & { id: string; user_id: string; completed_at: string; persistence_source: 'local' }> {
  const effectiveId = (userId || 'meet8kotecha').trim();
  const base = generateDemoQuizSessions(effectiveId);
  return base.map((s, idx) => ({
    ...s,
    id: `demo-qs-${idx + 1}`,
    user_id: effectiveId,
    completed_at: new Date(Date.now() - (idx * 24 * 60 * 60 * 1000)).toISOString(),
    persistence_source: 'local',
  }));
}

export function loadDemoProgress(userId?: string | null): { attemptsCount: number } {
  const effectiveId = (userId || 'meet8kotecha').trim();
  const attempts = generateRealisticDemoAttempts(effectiveId);
  const tasks = generateDemoPlannerTasks(effectiveId);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(getEffectiveKey(DEMO_ATTEMPTS_PREFIX, effectiveId), JSON.stringify(attempts));
    localStorage.setItem(getEffectiveKey(DEMO_PLANNER_PREFIX, effectiveId), JSON.stringify(tasks));
  }

  setDemoModeActive(true, effectiveId);
  return { attemptsCount: attempts.length };
}

export function clearDemoProgress(userId?: string | null): void {
  const effectiveId = (userId || 'meet8kotecha').trim();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(getEffectiveKey(DEMO_ATTEMPTS_PREFIX, effectiveId));
    localStorage.removeItem(getEffectiveKey(DEMO_PLANNER_PREFIX, effectiveId));
    localStorage.removeItem(getEffectiveKey(DEMO_SESSIONS_PREFIX, effectiveId));
  }
  setDemoModeActive(false, effectiveId);
}
