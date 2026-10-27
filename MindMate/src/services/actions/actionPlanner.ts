/**
 * MindMate Action Planner
 *
 * Translates user requests (via text or voice) into structured, validated ActionPlans.
 * Combines high-precision deterministic parsing for common requests with Gemma 4 Ollama
 * structured JSON planning.
 */

import {
  ActionExecutionContext,
  ActionPlan,
  ActionPlanStep,
  ActionProposal,
  ActionType,
  PlannerTaskPreview,
} from './types';
import { actionRegistry, TARGET_ROUTE_MAP } from './actionRegistry';
import { resolveTopicMetadata, TOPICS } from '../../data/learningContent';
import {
  readLocalAttempts,
  buildLearnerAnalyticsSnapshot,
} from '../assessment/assessmentService';

/**
 * Normalizes user text for intent matching.
 */
function normalizeInput(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[.,?!:;'"(){}\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects if the prompt is an unsupported, malicious, or external request.
 */
function isUnsupportedRequest(norm: string): string | null {
  if (
    norm.includes('rm -rf') ||
    norm.includes('drop table') ||
    norm.includes('delete from') ||
    norm.includes('select * from') ||
    norm.includes('eval(') ||
    norm.includes('exec(') ||
    norm.includes('<script') ||
    norm.includes('bash') ||
    norm.includes('curl ') ||
    norm.includes('shell command')
  ) {
    return 'Arbitrary script or shell execution is strictly disallowed for security.';
  }

  if (
    norm.includes('order pizza') ||
    norm.includes('buy ') ||
    norm.includes('purchase ') ||
    norm.includes('credit card') ||
    norm.includes('transfer money') ||
    norm.includes('crypto')
  ) {
    return 'Financial transactions and external purchases are not supported.';
  }

  return null;
}

/**
 * Determines day from conversational text (e.g. "tomorrow", "on Wednesday", "next Monday").
 */
function resolveDayFromText(text: string, baseDate = new Date()): 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun' {
  const norm = text.toLowerCase();
  const days: Array<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'> = [
    'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
  ];

  if (norm.includes('tomorrow')) {
    const tomorrowIdx = (baseDate.getDay() + 1) % 7;
    return days[tomorrowIdx];
  }
  if (norm.includes('today')) {
    return days[baseDate.getDay()];
  }
  if (norm.includes('monday') || norm.includes('mon')) return 'Mon';
  if (norm.includes('tuesday') || norm.includes('tue')) return 'Tue';
  if (norm.includes('wednesday') || norm.includes('wed')) return 'Wed';
  if (norm.includes('thursday') || norm.includes('thu')) return 'Thu';
  if (norm.includes('friday') || norm.includes('fri')) return 'Fri';
  if (norm.includes('saturday') || norm.includes('sat')) return 'Sat';
  if (norm.includes('sunday') || norm.includes('sun')) return 'Sun';

  // Default to tomorrow or Mon
  return 'Mon';
}

/**
 * Creates a deterministic study plan preview given a subject, duration in days, and daily minutes.
 */
export function buildStudyPlanPreview(
  subject: string,
  durationDays: number,
  dailyMinutes: number,
  context: ActionExecutionContext
): { summary: string; tasks: PlannerTaskPreview[] } {
  const attempts = readLocalAttempts(context.userId);
  const snapshot = buildLearnerAnalyticsSnapshot(context.userId, attempts);
  const nextRec = snapshot.nextLearningAction;

  const cleanSubject = (subject || 'python').toLowerCase();
  const subjectTopics = TOPICS.filter(
    (t) => t.subjectId === cleanSubject || cleanSubject.includes(t.subjectId)
  );
  const pool = subjectTopics.length > 0 ? subjectTopics : TOPICS;

  const validDays: Array<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'> = [
    'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
  ];

  const tasks: PlannerTaskPreview[] = [];

  for (let i = 0; i < durationDays; i++) {
    const day = validDays[i % validDays.length];
    // Put weakest / recommended topic first if available
    const topic = i === 0 && nextRec?.nextTopicId
      ? pool.find((t) => t.id === nextRec.nextTopicId) || pool[0]
      : pool[i % pool.length];

    const type = i % 2 === 0 ? 'revision' : 'practice';
    tasks.push({
      id: `preview-task-${i + 1}`,
      day,
      name: `${type === 'revision' ? 'Revise' : 'Practice'}: ${topic.name}`,
      duration: `${dailyMinutes}m`,
      type,
      priority: i === 0 ? 'high' : 'medium',
      topic: topic.id,
    });
  }

  const summary = `Generated a ${durationDays}-day ${subject} revision plan (${dailyMinutes} mins/day) with ${tasks.length} targeted study sessions.`;
  return { summary, tasks };
}

/**
 * High-precision deterministic parser for action commands.
 * Returns an ActionPlan if an action intent is detected, or null if plain conversational chat.
 */
export function parseDeterministicAction(
  userInput: string,
  context: ActionExecutionContext
): ActionPlan | null {
  const norm = normalizeInput(userInput);
  const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // 1. Check for malicious / unsupported commands
  const unsupportedReason = isUnsupportedRequest(norm);
  if (unsupportedReason) {
    return {
      id: planId,
      userIntent: userInput,
      status: 'failed',
      summary: 'Action blocked for safety.',
      steps: [
        {
          id: 'step-unsupported',
          action: 'unsupported',
          title: 'Unsupported Request',
          description: unsupportedReason,
          params: { reason: unsupportedReason },
          state: 'failed',
          requiresConfirmation: false,
          error: unsupportedReason,
        },
      ],
      createdAt: Date.now(),
      error: unsupportedReason,
    };
  }

  // 2. Navigation Actions
  if (
    norm.startsWith('open ') ||
    norm.startsWith('show ') ||
    norm.startsWith('go to ') ||
    norm.startsWith('take me to ') ||
    norm.startsWith('navigate to ')
  ) {
    // Home
    if (norm.endsWith(' home') || norm.includes(' home') || norm === 'open home') {
      return {
        id: planId,
        userIntent: userInput,
        status: 'draft',
        summary: 'Opening Home...',
        steps: [
          {
            id: 'step-nav-home',
            action: 'navigate_page',
            title: 'Navigate to Home',
            description: 'Opening Home dashboard.',
            params: { target: 'home', route: '/home' },
            state: 'pending',
            requiresConfirmation: false,
            link: { label: 'Open Home', url: '/home' },
          },
        ],
        createdAt: Date.now(),
      };
    }

    // Planner
    if (norm.includes('planner') || norm.includes('schedule') || norm.includes('calendar')) {
      return {
        id: planId,
        userIntent: userInput,
        status: 'draft',
        summary: 'Opening your Study Planner...',
        steps: [
          {
            id: 'step-nav-planner',
            action: 'navigate_page',
            title: 'Navigate to Planner',
            description: 'Opening the weekly study schedule.',
            params: { target: 'planner', route: '/planner' },
            state: 'pending',
            requiresConfirmation: false,
            link: { label: 'Open Planner', url: '/planner' },
          },
        ],
        createdAt: Date.now(),
      };
    }

    // Progress
    if (norm.includes('progress') || norm.includes('history') || norm.includes('results')) {
      return {
        id: planId,
        userIntent: userInput,
        status: 'draft',
        summary: 'Opening your Progress Dashboard...',
        steps: [
          {
            id: 'step-nav-progress',
            action: 'navigate_page',
            title: 'Navigate to Progress',
            description: 'Opening attempt history and performance trends.',
            params: { target: 'progress', route: '/progress' },
            state: 'pending',
            requiresConfirmation: false,
            link: { label: 'Open Progress', url: '/progress' },
          },
        ],
        createdAt: Date.now(),
      };
    }

    // Insights
    if (norm.includes('insight') || norm.includes('analytics')) {
      return {
        id: planId,
        userIntent: userInput,
        status: 'draft',
        summary: 'Opening Learning Insights...',
        steps: [
          {
            id: 'step-nav-insights',
            action: 'navigate_page',
            title: 'Navigate to Insights',
            description: 'Opening topic mastery breakdown and analytics.',
            params: { target: 'insights', route: '/insights' },
            state: 'pending',
            requiresConfirmation: false,
            link: { label: 'Open Insights', url: '/insights' },
          },
        ],
        createdAt: Date.now(),
      };
    }

    // Learning Twin
    if (norm.includes('learning twin') || norm.includes('twin')) {
      return {
        id: planId,
        userIntent: userInput,
        status: 'draft',
        summary: 'Opening your Learning Twin...',
        steps: [
          {
            id: 'step-nav-twin',
            action: 'navigate_page',
            title: 'Navigate to Learning Twin',
            description: 'Opening simulation model and cognitive twin.',
            params: { target: 'learning-twin', route: '/learning-twin' },
            state: 'pending',
            requiresConfirmation: false,
            link: { label: 'Open Learning Twin', url: '/learning-twin' },
          },
        ],
        createdAt: Date.now(),
      };
    }

    // Practice / Quizzes
    if (norm.includes('practice') || norm.includes('quizzes')) {
      return {
        id: planId,
        userIntent: userInput,
        status: 'draft',
        summary: 'Opening Practice Arena...',
        steps: [
          {
            id: 'step-nav-practice',
            action: 'navigate_page',
            title: 'Navigate to Practice',
            description: 'Opening interactive quizzes and diagnostic assessments.',
            params: { target: 'practice', route: '/practice' },
            state: 'pending',
            requiresConfirmation: false,
            link: { label: 'Open Practice', url: '/practice' },
          },
        ],
        createdAt: Date.now(),
      };
    }

    // Mistakes
    if (norm.includes('mistake') || norm.includes('errors') || norm.includes('weak spots')) {
      return {
        id: planId,
        userIntent: userInput,
        status: 'draft',
        summary: 'Opening Mistake Review...',
        steps: [
          {
            id: 'step-nav-mistakes',
            action: 'navigate_page',
            title: 'Navigate to Mistake Review',
            description: 'Reviewing recurring misconceptions and missed questions.',
            params: { target: 'mistakes', route: '/practice/mistake-review' },
            state: 'pending',
            requiresConfirmation: false,
            link: { label: 'Open Mistake Review', url: '/practice/mistake-review' },
          },
        ],
        createdAt: Date.now(),
      };
    }

    // Materials
    if (norm.includes('material') || norm.includes('document') || norm.includes('notes')) {
      return {
        id: planId,
        userIntent: userInput,
        status: 'draft',
        summary: 'Opening Study Materials...',
        steps: [
          {
            id: 'step-nav-materials',
            action: 'navigate_page',
            title: 'Navigate to Materials',
            description: 'Opening course documents and notes.',
            params: { target: 'materials', route: '/materials' },
            state: 'pending',
            requiresConfirmation: false,
            link: { label: 'Open Materials', url: '/materials' },
          },
        ],
        createdAt: Date.now(),
      };
    }

    // Zoom Classes
    if (norm.includes('zoom') || norm.includes('class')) {
      return {
        id: planId,
        userIntent: userInput,
        status: 'draft',
        summary: 'Opening Zoom Classes...',
        steps: [
          {
            id: 'step-nav-zoom',
            action: 'navigate_page',
            title: 'Navigate to Zoom Classes',
            description: 'Opening live Zoom classes schedule.',
            params: { target: 'zoom', route: '/zoom-classes' },
            state: 'pending',
            requiresConfirmation: false,
            link: { label: 'Open Zoom Classes', url: '/zoom-classes' },
          },
        ],
        createdAt: Date.now(),
      };
    }

    // Settings
    if (norm.includes('setting')) {
      return {
        id: planId,
        userIntent: userInput,
        status: 'draft',
        summary: 'Opening Settings...',
        steps: [
          {
            id: 'step-nav-settings',
            action: 'navigate_page',
            title: 'Navigate to Settings',
            description: 'Opening account and app settings.',
            params: { target: 'settings', route: '/settings' },
            state: 'pending',
            requiresConfirmation: false,
            link: { label: 'Open Settings', url: '/settings' },
          },
        ],
        createdAt: Date.now(),
      };
    }

    // Voice mode
    if (norm.includes('voice mode') || norm.includes('voice assistant') || norm.includes('voice')) {
      return {
        id: planId,
        userIntent: userInput,
        status: 'draft',
        summary: 'Opening Mate AI Voice Mode...',
        steps: [
          {
            id: 'step-open-voice',
            action: 'open_voice_mode',
            title: 'Open Voice Mode',
            description: 'Enabling hands-free microphone voice assistant.',
            params: {},
            state: 'pending',
            requiresConfirmation: false,
          },
        ],
        createdAt: Date.now(),
      };
    }
  }

  // 3. Multi-Step Study Plan Creation
  // Examples:
  // "Create a seven-day Python study plan"
  // "Prepare me for my Python exam next week"
  // "Plan my revision for next week's exam"
  if (
    /create.*study plan/i.test(userInput) ||
    /plan my revision/i.test(userInput) ||
    /prepare me for.*exam/i.test(userInput) ||
    /schedule a \d+-day.*plan/i.test(userInput) ||
    /seven-day.*plan/i.test(userInput) ||
    /7-day.*plan/i.test(userInput)
  ) {
    let subject = 'Python';
    if (norm.includes('sql') || norm.includes('database') || norm.includes('dbms')) subject = 'SQL';
    else if (norm.includes('dsa') || norm.includes('stack') || norm.includes('queue') || norm.includes('tree')) subject = 'DSA';

    let durationDays = 7;
    const daysMatch = userInput.match(/(\d+)[ -]day/i);
    if (daysMatch) {
      durationDays = Math.min(14, Math.max(1, parseInt(daysMatch[1], 10)));
    } else if (norm.includes('seven')) {
      durationDays = 7;
    } else if (norm.includes('three') || norm.includes('3-day')) {
      durationDays = 3;
    } else if (norm.includes('five') || norm.includes('5-day')) {
      durationDays = 5;
    }

    const dailyMinutes = 30;
    const preview = buildStudyPlanPreview(subject, durationDays, dailyMinutes, context);

    return {
      id: planId,
      planId: `plan_${subject.toLowerCase()}_${durationDays}d`,
      userIntent: userInput,
      status: 'awaiting_confirmation', // Must preview and await confirmation!
      summary: preview.summary,
      steps: [
        {
          id: 'step-inspect-weakness',
          action: 'recommend_next_action',
          title: 'Analyze Performance & Mastery Gaps',
          description: `Inspecting past quiz attempts for ${subject} to prioritize high-yield topics.`,
          params: { focus: 'weakest' },
          state: 'pending',
          requiresConfirmation: false,
        },
        {
          id: 'step-save-plan',
          action: 'create_study_plan',
          title: `Schedule ${durationDays}-Day ${subject} Plan`,
          description: `Add ${preview.tasks.length} balanced revision and practice sessions to your Weekly Planner.`,
          params: {
            subject: subject.toLowerCase(),
            durationDays,
            dailyMinutes,
            tasks: preview.tasks,
            planId: `plan_${subject.toLowerCase()}_${durationDays}d`,
          },
          state: 'awaiting_confirmation',
          requiresConfirmation: true, // Safety: Requires explicit user approval
          previewData: {
            tasks: preview.tasks,
            details: `${durationDays} days • ${dailyMinutes} mins/session`,
          },
          link: { label: 'View in Planner', url: '/planner' },
        },
      ],
      createdAt: Date.now(),
    };
  }

  // 4. Add single planner task
  // Examples:
  // "Add a revision session for SQL tomorrow"
  // "Schedule practice for my weakest topic"
  if (
    norm.startsWith('add a revision session') ||
    norm.startsWith('add a practice session') ||
    norm.startsWith('schedule practice') ||
    norm.startsWith('schedule revision')
  ) {
    let topicName = 'SQL';
    let topicId = 'dbms-sql';

    if (norm.includes('weakest')) {
      const attempts = readLocalAttempts(context.userId);
      const snapshot = buildLearnerAnalyticsSnapshot(context.userId, attempts);
      const rec = snapshot.nextLearningAction;
      topicName = rec.nextTopicName;
      topicId = rec.nextTopicId;
    } else if (norm.includes('python')) {
      topicName = 'Python Functions';
      topicId = 'python-functions';
    } else if (norm.includes('sql')) {
      topicName = 'SQL Joins';
      topicId = 'dbms-sql';
    } else if (norm.includes('loop')) {
      topicName = 'Loops & Iteration';
      topicId = 'python-loops';
    }

    const day = resolveDayFromText(userInput);
    const type = norm.includes('revision') ? 'revision' : 'practice';
    const taskName = `${type === 'revision' ? 'Revise' : 'Practice'}: ${topicName}`;

    return {
      id: planId,
      userIntent: userInput,
      status: 'awaiting_confirmation',
      summary: `Proposing to schedule '${taskName}' on ${day}.`,
      steps: [
        {
          id: 'step-add-task',
          action: 'add_planner_task',
          title: `Schedule Task: ${taskName}`,
          description: `Create a 30m ${type} session for ${day} in your Planner.`,
          params: {
            name: taskName,
            day,
            duration: '30m',
            type,
            priority: 'medium',
            topic: topicId,
          },
          state: 'awaiting_confirmation',
          requiresConfirmation: true,
          previewData: {
            tasks: [
              {
                day,
                name: taskName,
                duration: '30m',
                type,
                priority: 'medium',
                topic: topicId,
              },
            ],
          },
          link: { label: 'Open Planner', url: '/planner' },
        },
      ],
      createdAt: Date.now(),
    };
  }

  // 5. Quiz Actions
  // Examples:
  // "Start a quiz on Python functions"
  // "Quiz me on SQL joins"
  // "Give me a short revision quiz on loops"
  // "Start a follow-up quiz on my weak topics"
  if (
    norm.startsWith('start a quiz') ||
    norm.startsWith('quiz me on') ||
    norm.startsWith('give me a short revision quiz') ||
    norm.startsWith('give me a quiz') ||
    norm.startsWith('start a follow-up quiz')
  ) {
    let topicText = 'python-functions';
    let quizType: 'adaptive' | 'diagnostic' = 'adaptive';

    if (norm.includes('weak topic') || norm.includes('weakest')) {
      const attempts = readLocalAttempts(context.userId);
      const snapshot = buildLearnerAnalyticsSnapshot(context.userId, attempts);
      const rec = snapshot.nextLearningAction;
      topicText = rec.nextTopicId;
    } else if (norm.includes('python function') || norm.includes('functions')) {
      topicText = 'python-functions';
    } else if (norm.includes('sql') || norm.includes('join')) {
      topicText = 'dbms-sql';
    } else if (norm.includes('loop')) {
      topicText = 'python-loops';
    } else if (norm.includes('variable')) {
      topicText = 'python-variables';
    } else if (norm.includes('oop') || norm.includes('object-oriented')) {
      topicText = 'python-oop';
    } else if (norm.includes('tree')) {
      topicText = 'dsa-trees';
    } else if (norm.includes('stack') || norm.includes('queue')) {
      topicText = 'dsa-queues-stacks';
    } else if (norm.includes('diagnostic')) {
      quizType = 'diagnostic';
    }

    const resolved = resolveTopicMetadata(topicText);
    const quizMatch = userInput.match(/quiz me on (.+)$/i);
    const originalTopicQuery = quizMatch
      ? quizMatch[1].trim()
      : norm.includes('loop')
        ? 'python loops'
        : resolved.name;

    return {
      id: planId,
      userIntent: userInput,
      status: 'draft',
      summary: `Starting ${quizType} quiz on ${resolved.name}...`,
      steps: [
        {
          id: 'step-start-quiz',
          action: 'start_quiz',
          title: `Start Quiz: ${resolved.name}`,
          description: `Launching interactive adaptive assessment for ${resolved.name}.`,
          params: {
            topicId: resolved.id,
            topicName: resolved.name,
            originalTopic: originalTopicQuery,
            quizType,
          },
          state: 'pending',
          requiresConfirmation: false,
          link: {
            label: `Start Quiz: ${resolved.name}`,
            url: `/practice/adaptive-quiz?topic=${encodeURIComponent(resolved.id)}&type=${quizType}`,
          },
        },
      ],
      createdAt: Date.now(),
    };
  }

  // 6. Adaptive learning queries
  // Examples:
  // "What should I study next?"
  // "Find my weakest topics"
  if (
    norm.includes('what should i study next') ||
    norm.includes('what to study next') ||
    norm.includes('find my weakest topic') ||
    norm.includes('my weak topics') ||
    norm.includes('where do i need improvement')
  ) {
    return {
      id: planId,
      userIntent: userInput,
      status: 'draft',
      summary: 'Analyzing your mastery metrics to identify the best next topic...',
      steps: [
        {
          id: 'step-recommend',
          action: 'recommend_next_action',
          title: 'Calculate Adaptive Next Step',
          description: 'Evaluating mastery decay, recurring mistakes, and curriculum dependencies.',
          params: { focus: 'weakest' },
          state: 'pending',
          requiresConfirmation: false,
        },
      ],
      createdAt: Date.now(),
    };
  }

  // Not a direct action command — let ordinary educational conversational tutor handle it
  return null;
}

/**
 * Validates untrusted model output (JSON from Ollama Gemma 4) against the registered schemas.
 */
export function validateActionProposal(rawProposal: any): {
  valid: boolean;
  proposal?: ActionProposal;
  error?: string;
} {
  if (!rawProposal || typeof rawProposal !== 'object') {
    return { valid: false, error: 'Model output is not a valid JSON object.' };
  }

  const actionName = String(rawProposal.action || rawProposal.tool || '').trim();
  const definition = actionRegistry[actionName as ActionType];

  if (!definition) {
    return {
      valid: false,
      error: `Unknown action '${actionName}'. The model requested an unregistered action.`,
    };
  }

  const validation = definition.validateParams(rawProposal.params || rawProposal.arguments || {});
  if (!validation.valid) {
    return {
      valid: false,
      error: `Action parameter validation failed for '${actionName}': ${validation.error}`,
    };
  }

  return {
    valid: true,
    proposal: {
      action: actionName as ActionType,
      params: validation.cleanParams || {},
      explanation: rawProposal.explanation ? String(rawProposal.explanation) : undefined,
    },
  };
}
