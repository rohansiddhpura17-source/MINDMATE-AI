import { prisma } from '../db.js';
import {
  evaluateAnswerMastery,
  ConfidenceLevel,
  DifficultyLevel,
  calculateBetaMastery,
  classifyConfidence,
} from './masteryModel.js';

export interface QuestionData {
  id: string;
  topicId: string;
  topicName: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  difficulty: DifficultyLevel;
  skill?: string;
  source?: string;
  materialId?: string;
  pageCitation?: number;
}

export interface AdaptiveSelectionResult {
  question: QuestionData;
  selectionReason: string;
  targetDifficulty: DifficultyLevel;
  topicId: string;
  topicName: string;
}

export interface AnswerSubmissionResult {
  isCorrect: boolean;
  correctOption: number;
  explanation: string;
  topicId: string;
  topicName: string;
  masteryBefore: number;
  masteryAfter: number;
  confidenceLevel: ConfidenceLevel;
  confidenceScore: number;
  evidenceSummary: string;
  nextDifficulty: DifficultyLevel;
  difficultyTransitionReason: string;
  nextQuestion: QuestionData | null;
  nextSelectionReason: string | null;
}

/**
 * Validates question schema and parameters.
 */
export function validateQuestion(q: {
  question: string;
  options: string[];
  correct: number;
  difficulty: string;
}): boolean {
  if (!q.question || q.question.trim().length < 5) return false;
  if (!Array.isArray(q.options) || q.options.length < 2) return false;
  if (typeof q.correct !== 'number' || q.correct < 0 || q.correct >= q.options.length) return false;
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) return false;
  return true;
}

/**
 * Initial curated question bank covering multiple difficulty tiers across foundational topics.
 */
export const DEFAULT_QUESTION_BANK: Array<Omit<QuestionData, 'id'>> = [
  // PYTHON FUNCTIONS (EASY)
  {
    topicId: 'python-funcs',
    topicName: 'Python Functions',
    question: 'Which keyword is used to define a function in Python?',
    options: ['function', 'def', 'func', 'define'],
    correct: 1,
    explanation: 'The def keyword begins a function definition in Python.',
    difficulty: 'easy',
    skill: 'syntax-definition',
  },
  {
    topicId: 'python-funcs',
    topicName: 'Python Functions',
    question: 'What is the return value of a Python function that executes without an explicit return statement?',
    options: ['0', 'None', 'False', 'Undefined'],
    correct: 1,
    explanation: 'Python functions implicitly return the singleton None if no return statement is executed.',
    difficulty: 'easy',
    skill: 'return-values',
  },
  // PYTHON FUNCTIONS (MEDIUM)
  {
    topicId: 'python-funcs',
    topicName: 'Python Functions',
    question: 'What does *args allow in a Python function definition?',
    options: [
      'Only keyword arguments',
      'A fixed number of arguments',
      'Variable number of positional arguments as a tuple',
      'Prevents any arguments from being passed',
    ],
    correct: 2,
    explanation: '*args collects any excess positional arguments into a tuple.',
    difficulty: 'medium',
    skill: 'variable-arguments',
  },
  {
    topicId: 'python-funcs',
    topicName: 'Python Functions',
    question: 'What is the output of def f(x, y=10): return x + y called with f(5)?',
    options: ['Error', '5', '15', '10'],
    correct: 2,
    explanation: 'y defaults to 10 when omitted, so 5 + 10 = 15.',
    difficulty: 'medium',
    skill: 'default-arguments',
  },
  // PYTHON FUNCTIONS (HARD)
  {
    topicId: 'python-funcs',
    topicName: 'Python Functions',
    question: 'What happens when a mutable object (e.g. a list) is used as a default argument in Python?',
    options: [
      'A fresh list is allocated on every function call',
      'The same list instance is shared and mutated across subsequent calls',
      'Python throws a SyntaxError during definition',
      'The argument is automatically converted to an immutable tuple',
    ],
    correct: 1,
    explanation:
      'Default arguments are evaluated once at function definition time, so mutable defaults persist and share state across calls.',
    difficulty: 'hard',
    skill: 'mutable-defaults-scope',
  },
  {
    topicId: 'python-funcs',
    topicName: 'Python Functions',
    question: 'In Python lexical scoping (LEGB), what does the nonlocal keyword do?',
    options: [
      'Binds a variable to the global module scope',
      'Declares a variable to refer to the nearest enclosing non-global scope',
      'Makes a variable accessible across different threads',
      'Imports a variable from another file',
    ],
    correct: 1,
    explanation:
      'The nonlocal keyword allows modifying a variable in an outer enclosing function scope rather than creating a local binding.',
    difficulty: 'hard',
    skill: 'closures-lexical-scope',
  },

  // OBJECT-ORIENTED PROGRAMMING (EASY)
  {
    topicId: 'oop-basics',
    topicName: 'OOP Concepts',
    question: 'What special method is called automatically when an object is instantiated in Python?',
    options: ['__init__', '__new__', '__start__', '__create__'],
    correct: 0,
    explanation: '__init__ is the initializer method called immediately after object creation.',
    difficulty: 'easy',
    skill: 'constructors',
  },
  // OOP (MEDIUM)
  {
    topicId: 'oop-basics',
    topicName: 'OOP Concepts',
    question: 'What is the main benefit of Polymorphism in Object-Oriented Programming?',
    options: [
      'Ensuring variables have only one data type',
      'Allowing different classes to be treated through a uniform interface',
      'Encrypting object data in memory',
      'Compiling code to machine language faster',
    ],
    correct: 1,
    explanation:
      'Polymorphism enables calling the same method name on different objects, each executing its own specialized behavior.',
    difficulty: 'medium',
    skill: 'polymorphism',
  },
  // OOP (HARD)
  {
    topicId: 'oop-basics',
    topicName: 'OOP Concepts',
    question: 'What algorithm does Python 3 use to resolve Method Resolution Order (MRO) in multiple inheritance?',
    options: [
      'Depth-First Search (DFS)',
      'C3 Superclass Linearization',
      'Breadth-First Search (BFS)',
      'Dijkstra Shortest Path',
    ],
    correct: 1,
    explanation:
      'Python uses the C3 Linearization algorithm to guarantee monotonic and consistent MRO across diamond inheritance patterns.',
    difficulty: 'hard',
    skill: 'mro-linearization',
  },

  // DATA STRUCTURES (EASY)
  {
    topicId: 'data-structures',
    topicName: 'Data Structures',
    question: 'Which data structure operates on a Last-In, First-Out (LIFO) principle?',
    options: ['Queue', 'Stack', 'Array', 'Linked List'],
    correct: 1,
    explanation: 'A Stack processes elements in LIFO order (last item pushed is first popped).',
    difficulty: 'easy',
    skill: 'stacks',
  },
  // DATA STRUCTURES (MEDIUM)
  {
    topicId: 'data-structures',
    topicName: 'Data Structures',
    question: 'What is the average time complexity of searching for a key in a balanced Binary Search Tree?',
    options: ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)'],
    correct: 1,
    explanation: 'Balanced BST search halves the remaining candidate keys at each step, running in logarithmic time O(log N).',
    difficulty: 'medium',
    skill: 'tree-complexity',
  },
  // DATA STRUCTURES (HARD)
  {
    topicId: 'data-structures',
    topicName: 'Data Structures',
    question: 'In an open-addressing Hash Table, what phenomenon occurs when keys hash to adjacent slots and lengthen probe sequences?',
    options: ['Thrashing', 'Primary Clustering', 'Deadlock', 'Buffer Bloat'],
    correct: 1,
    explanation:
      'Primary clustering occurs in linear probing when occupied slots form contiguous blocks, increasing collision resolution time.',
    difficulty: 'hard',
    skill: 'hashing-collision-resolution',
  },
];

/**
 * Seeds default questions into the database if not yet present.
 */
export async function seedQuestionsIfEmpty(): Promise<number> {
  const count = await prisma.adaptiveQuestion.count();
  if (count > 0) return count;

  console.log('[AdaptiveEngine] Seeding initial adaptive question bank...');
  for (const q of DEFAULT_QUESTION_BANK) {
    await prisma.adaptiveQuestion.create({
      data: {
        topicId: q.topicId,
        topicName: q.topicName,
        question: q.question,
        optionsJson: JSON.stringify(q.options),
        correct: q.correct,
        explanation: q.explanation,
        difficulty: q.difficulty,
        skill: q.skill,
        source: q.source || 'SYSTEM',
      },
    });
  }

  return DEFAULT_QUESTION_BANK.length;
}

/**
 * Non-Adaptive Selector Baseline:
 * Selects questions sequentially by index, ignoring learner proficiency and error streaks.
 */
export async function selectNonAdaptiveQuestion(
  topicId: string,
  currentIndex: number
): Promise<QuestionData | null> {
  await seedQuestionsIfEmpty();
  const questions = await prisma.adaptiveQuestion.findMany({
    where: { topicId },
    orderBy: { createdAt: 'asc' },
  });

  if (questions.length === 0) return null;
  const raw = questions[currentIndex % questions.length];
  return {
    id: raw.id,
    topicId: raw.topicId,
    topicName: raw.topicName,
    question: raw.question,
    options: JSON.parse(raw.optionsJson),
    correct: raw.correct,
    explanation: raw.explanation,
    difficulty: raw.difficulty as DifficultyLevel,
    skill: raw.skill || undefined,
    source: raw.source,
  };
}

/**
 * Adaptive Question Selector:
 * Selects the next question based on current mastery evidence, targeting knowledge gaps
 * and adjusting difficulty based on performance history.
 */
export async function selectNextAdaptiveQuestion(
  userId: string,
  options: {
    topicId?: string;
    excludeQuestionIds?: string[];
    preferredDifficulty?: DifficultyLevel;
  } = {}
): Promise<AdaptiveSelectionResult> {
  await seedQuestionsIfEmpty();

  // 1. Identify Target Topic
  let targetTopicId = options.topicId;
  let targetTopicName = 'Python Functions';

  let progress = targetTopicId
    ? await prisma.learnerProgress.findUnique({
        where: { userId_topicId: { userId, topicId: targetTopicId } },
      })
    : null;

  // If no topic specified, target the user's primary knowledge gap (lowest mastery or uncalibrated)
  if (!targetTopicId) {
    const allProgress = await prisma.learnerProgress.findMany({
      where: { userId },
      orderBy: [{ confidenceLevel: 'asc' }, { masteryScore: 'asc' }],
    });

    if (allProgress.length > 0) {
      progress = allProgress[0];
      targetTopicId = progress.topicId;
      targetTopicName = progress.topicName;
    } else {
      targetTopicId = 'python-funcs';
      targetTopicName = 'Python Functions';
    }
  } else if (progress) {
    targetTopicName = progress.topicName;
  }

  // 2. Determine Target Difficulty
  let targetDifficulty: DifficultyLevel = 'medium'; // Default diagnostic baseline
  let selectionReason = '';

  if (options.preferredDifficulty) {
    targetDifficulty = options.preferredDifficulty;
    selectionReason = `Manual preference set to ${targetDifficulty.toUpperCase()} difficulty.`;
  } else if (progress && (progress.consecutiveCorrect >= 2 || progress.consecutiveIncorrect >= 2 || progress.attemptCount >= 3)) {
    targetDifficulty = (progress.currentDifficulty as DifficultyLevel) || 'medium';
    const accuracy = Math.round((progress.correctCount / Math.max(1, progress.attemptCount)) * 100);

    if (progress.consecutiveCorrect >= 2) {
      selectionReason = `Selected ${targetDifficulty.toUpperCase()} difficulty due to sustained performance (2 consecutive correct answers, ${progress.masteryScore}% mastery).`;
    } else if (progress.consecutiveIncorrect >= 2) {
      selectionReason = `Selected ${targetDifficulty.toUpperCase()} difficulty for foundational reinforcement following repeated mistakes (${progress.masteryScore}% mastery).`;
    } else {
      selectionReason = `Selected ${targetDifficulty.toUpperCase()} question to solidify ${targetTopicName} proficiency (${accuracy}% accuracy across ${progress.attemptCount} attempts).`;
    }
  } else {
    targetDifficulty = 'medium';
    selectionReason = `Initial diagnostic assessment at MEDIUM difficulty to establish a baseline for ${targetTopicName}.`;
  }

  const excludeIds = options.excludeQuestionIds || [];

  // 3. Question Retrieval with Graceful Fallback
  // Try 1: Exact topic + target difficulty (excluding already seen in session)
  let candidate = await prisma.adaptiveQuestion.findFirst({
    where: {
      topicId: targetTopicId,
      difficulty: targetDifficulty,
      id: { notIn: excludeIds },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Try 2: Exact topic + adjacent difficulty (if target difficulty exhausted)
  if (!candidate) {
    const fallbackDiff: DifficultyLevel = targetDifficulty === 'hard' ? 'medium' : 'easy';
    candidate = await prisma.adaptiveQuestion.findFirst({
      where: {
        topicId: targetTopicId,
        difficulty: fallbackDiff,
        id: { notIn: excludeIds },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (candidate) {
      selectionReason += ` (Fallback to ${fallbackDiff.toUpperCase()} because unasked ${targetDifficulty.toUpperCase()} questions were exhausted).`;
      targetDifficulty = fallbackDiff;
    }
  }

  // Try 3: Any unasked question in the topic
  if (!candidate) {
    candidate = await prisma.adaptiveQuestion.findFirst({
      where: {
        topicId: targetTopicId,
        id: { notIn: excludeIds },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (candidate) {
      selectionReason += ` (Selected available ${candidate.difficulty.toUpperCase()} question).`;
      targetDifficulty = candidate.difficulty as DifficultyLevel;
    }
  }

  // Try 4: All questions in topic exhausted; select least recently answered review question
  if (!candidate) {
    candidate = await prisma.adaptiveQuestion.findFirst({
      where: { topicId: targetTopicId },
      orderBy: { createdAt: 'asc' },
    });
    if (candidate) {
      selectionReason = `Review mode: All new questions for ${targetTopicName} have been answered. Presenting review question.`;
      targetDifficulty = candidate.difficulty as DifficultyLevel;
    }
  }

  // Absolute fallback: Any question in database
  if (!candidate) {
    candidate = await prisma.adaptiveQuestion.findFirst();
  }

  if (!candidate) {
    throw new Error('Adaptive question bank is empty. Seed questions before practice.');
  }

  return {
    question: {
      id: candidate.id,
      topicId: candidate.topicId,
      topicName: candidate.topicName,
      question: candidate.question,
      options: JSON.parse(candidate.optionsJson),
      correct: candidate.correct,
      explanation: candidate.explanation,
      difficulty: candidate.difficulty as DifficultyLevel,
      skill: candidate.skill || undefined,
      source: candidate.source,
      materialId: candidate.materialId || undefined,
      pageCitation: candidate.pageCitation || undefined,
    },
    selectionReason,
    targetDifficulty,
    topicId: candidate.topicId,
    topicName: candidate.topicName,
  };
}

/**
 * Connects the closed learning loop:
 * Answer Question -> Evaluate -> Update Evidence -> Recalculate Mastery -> Select Next Question -> Persist.
 */
export async function processAdaptiveAnswer(
  userId: string,
  input: {
    questionId: string;
    selectedOption: number;
    clientEventId?: string;
    sessionExcludedIds?: string[];
  }
): Promise<AnswerSubmissionResult> {
  const question = await prisma.adaptiveQuestion.findUnique({
    where: { id: input.questionId },
  });

  if (!question) {
    throw new Error(`Question ${input.questionId} not found.`);
  }

  const isCorrect = input.selectedOption === question.correct;

  // 1. Fetch or create LearnerProgress
  let currentProgress = await prisma.learnerProgress.findUnique({
    where: { userId_topicId: { userId, topicId: question.topicId } },
  });

  if (!currentProgress) {
    currentProgress = await prisma.learnerProgress.create({
      data: {
        userId,
        topicId: question.topicId,
        topicName: question.topicName,
        masteryScore: 50.0,
        attemptCount: 0,
        correctCount: 0,
        consecutiveCorrect: 0,
        consecutiveIncorrect: 0,
        confidenceLevel: 'INSUFFICIENT_EVIDENCE',
        currentDifficulty: 'medium',
      },
    });
  }

  const masteryBefore = currentProgress.masteryScore;

  // 2. Evaluate updated mastery with Beta-Binomial Bayesian model
  const evaluation = evaluateAnswerMastery({
    currentMasteryScore: currentProgress.masteryScore,
    attemptCount: currentProgress.attemptCount,
    correctCount: currentProgress.correctCount,
    consecutiveCorrect: currentProgress.consecutiveCorrect,
    consecutiveIncorrect: currentProgress.consecutiveIncorrect,
    currentDifficulty: (currentProgress.currentDifficulty as DifficultyLevel) || 'medium',
    isCorrect,
  });

  // 3. Atomically persist updated learner progress
  await prisma.learnerProgress.update({
    where: { userId_topicId: { userId, topicId: question.topicId } },
    data: {
      masteryScore: evaluation.newMasteryScore,
      attemptCount: evaluation.newAttemptCount,
      correctCount: evaluation.newCorrectCount,
      consecutiveCorrect: evaluation.consecutiveCorrect,
      consecutiveIncorrect: evaluation.consecutiveIncorrect,
      confidenceLevel: evaluation.confidenceLevel,
      currentDifficulty: evaluation.newDifficulty,
      lastPracticed: new Date(),
    },
  });

  // 4. Select the next adaptive question (excluding already answered in this session)
  const excluded = Array.from(new Set([...(input.sessionExcludedIds || []), input.questionId]));
  let nextAdaptive: AdaptiveSelectionResult | null = null;
  try {
    nextAdaptive = await selectNextAdaptiveQuestion(userId, {
      topicId: question.topicId,
      excludeQuestionIds: excluded,
      preferredDifficulty: evaluation.newDifficulty,
    });
  } catch (err) {
    console.warn('[AdaptiveEngine] Next question selection fallback:', err);
  }

  return {
    isCorrect,
    correctOption: question.correct,
    explanation: question.explanation,
    topicId: question.topicId,
    topicName: question.topicName,
    masteryBefore,
    masteryAfter: evaluation.newMasteryScore,
    confidenceLevel: evaluation.confidenceLevel,
    confidenceScore: evaluation.confidenceScore,
    evidenceSummary: evaluation.evidenceSummary,
    nextDifficulty: evaluation.newDifficulty,
    difficultyTransitionReason: evaluation.difficultyTransitionReason,
    nextQuestion: nextAdaptive?.question || null,
    nextSelectionReason: nextAdaptive?.selectionReason || null,
  };
}
