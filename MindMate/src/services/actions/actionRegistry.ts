/**
 * MindMate Action Registry
 *
 * Strongly typed registry of all executable actions. Validates untrusted model output,
 * enforces user-scoped permissions, checks confirmation requirements, and executes
 * via real application services (Router, DB, Assessment Engine).
 */

import {
  ActionDefinition,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionType,
  PlannerTaskPreview,
  SupportedPageTarget,
} from './types';
import {
  batchCreatePlannerTasks,
  createPlannerTask,
  updatePlannerTask,
  updatePlannerTaskDetails,
  deletePlannerTask,
  getPlannerTasks,
} from '../../lib/db';
import { resolveTopicMetadata, TOPICS } from '../../data/learningContent';
import {
  readLocalAttempts,
  loadLearnerAnalytics,
  buildLearnerAnalyticsSnapshot,
} from '../assessment/assessmentService';

export const TARGET_ROUTE_MAP: Record<SupportedPageTarget, string> = {
  planner: '/planner',
  progress: '/progress',
  insights: '/insights',
  'learning-twin': '/learning-twin',
  practice: '/practice',
  'practice-adaptive': '/practice/adaptive-quiz',
  'practice-quiz': '/practice/quiz',
  mistakes: '/practice/mistake-review',
  materials: '/materials',
  home: '/home',
  settings: '/settings',
  zoom: '/zoom-classes',
  voice: '/learn',
};

const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type ValidDay = (typeof VALID_DAYS)[number];

// In-memory set of executed plan IDs to ensure idempotency across retries
const executedPlanKeys = new Set<string>();

export function clearExecutedPlanKeys(): void {
  executedPlanKeys.clear();
}

/**
 * Validates that an incoming user_id from an untrusted model does NOT attempt
 * to modify or access data for another user.
 */
function assertAuthorizedUser(context: ActionExecutionContext, providedUserId?: string): void {
  if (providedUserId && providedUserId !== context.userId) {
    throw new Error(
      `Unauthorized: user ${context.userId} cannot modify or access data for user ${providedUserId}.`
    );
  }
}

export const actionRegistry: Record<ActionType, ActionDefinition> = {
  // 1. Navigation Action
  navigate_page: {
    id: 'navigate_page',
    name: 'Navigate to Page',
    description: 'Directly navigates to an existing application page via React Router.',
    requiresConfirmation: () => false,
    validateParams: (raw: any) => {
      if (!raw || typeof raw !== 'object') {
        return { valid: false, error: 'Invalid parameters: expected an object.' };
      }
      const target = String(raw.target || raw.route || raw.page || '').trim().toLowerCase();
      const validTargets = Object.keys(TARGET_ROUTE_MAP) as SupportedPageTarget[];

      // Match direct target key or map from route
      let matchedTarget: SupportedPageTarget | undefined = validTargets.find(
        (t) => t === target || TARGET_ROUTE_MAP[t] === target
      );

      if (!matchedTarget) {
        if (target.includes('plan')) matchedTarget = 'planner';
        else if (target.includes('progress')) matchedTarget = 'progress';
        else if (target.includes('insight')) matchedTarget = 'insights';
        else if (target.includes('twin')) matchedTarget = 'learning-twin';
        else if (target.includes('mistake')) matchedTarget = 'mistakes';
        else if (target.includes('practice')) matchedTarget = 'practice';
        else if (target.includes('material')) matchedTarget = 'materials';
        else if (target.includes('home')) matchedTarget = 'home';
        else if (target.includes('setting')) matchedTarget = 'settings';
        else if (target.includes('zoom') || target.includes('class')) matchedTarget = 'zoom';
        else if (target.includes('voice')) matchedTarget = 'voice';
      }

      if (!matchedTarget) {
        return {
          valid: false,
          error: `Invalid navigation target '${target}'. Allowed destinations: ${validTargets.join(', ')}.`,
        };
      }

      return {
        valid: true,
        cleanParams: {
          target: matchedTarget,
          route: TARGET_ROUTE_MAP[matchedTarget],
        },
      };
    },
    execute: async (params, context) => {
      const target = params.target as SupportedPageTarget;
      const route = TARGET_ROUTE_MAP[target] || '/home';

      if (target === 'voice' && context.openVoiceMode) {
        context.openVoiceMode();
        return {
          success: true,
          message: 'Opened Mate AI voice mode.',
          executedRoute: '/learn',
          link: { label: 'Voice Assistant', url: '/learn' },
        };
      }

      if (context.navigate) {
        context.navigate(route);
      }

      const readableNames: Record<SupportedPageTarget, string> = {
        planner: 'Study Planner',
        progress: 'Progress Dashboard',
        insights: 'Learning Insights',
        'learning-twin': 'Learning Twin',
        practice: 'Practice Quizzes',
        'practice-adaptive': 'Adaptive Quiz',
        'practice-quiz': 'Diagnostic Quiz',
        mistakes: 'Mistake Review',
        materials: 'Study Materials',
        home: 'Home Dashboard',
        settings: 'Settings',
        zoom: 'Zoom Classes',
        voice: 'Voice Mode',
      };

      return {
        success: true,
        message: `Navigated to ${readableNames[target] || target}.`,
        executedRoute: route,
        link: { label: `Open ${readableNames[target] || target}`, url: route },
      };
    },
  },

  // 2. Create Study Plan Action
  create_study_plan: {
    id: 'create_study_plan',
    name: 'Create Multi-Day Study Plan',
    description: 'Generates a structured, evidence-grounded study plan and saves tasks to the planner.',
    requiresConfirmation: () => true, // Significant data modification requires confirmation!
    validateParams: (raw: any) => {
      if (!raw || typeof raw !== 'object') {
        return { valid: false, error: 'Expected parameters object for study plan.' };
      }
      const durationDays = Number(raw.durationDays || raw.days || 7);
      if (isNaN(durationDays) || durationDays < 1 || durationDays > 14) {
        return { valid: false, error: 'durationDays must be a number between 1 and 14.' };
      }
      const dailyMinutes = Number(raw.dailyMinutes || raw.minutesPerDay || 30);
      if (isNaN(dailyMinutes) || dailyMinutes < 10 || dailyMinutes > 180) {
        return { valid: false, error: 'dailyMinutes must be between 10 and 180 minutes.' };
      }
      const subject = String(raw.subject || 'python').toLowerCase().trim();

      return {
        valid: true,
        cleanParams: {
          subject,
          durationDays,
          dailyMinutes,
          targetGoal: raw.targetGoal ? String(raw.targetGoal) : undefined,
          targetExam: raw.targetExam ? String(raw.targetExam) : undefined,
          weakTopicsOnly: Boolean(raw.weakTopicsOnly),
          tasks: Array.isArray(raw.tasks) ? raw.tasks : undefined,
          planId: raw.planId ? String(raw.planId) : undefined,
          user_id: raw.user_id ? String(raw.user_id) : undefined,
        },
      };
    },
    execute: async (params, context) => {
      assertAuthorizedUser(context, params.user_id);

      if (context.mockFailSaves) {
        return {
          success: false,
          error: 'Database connection failed while saving study plan. Please retry.',
        };
      }

      const planKey = `${context.userId}_plan_${params.planId || params.subject}_${params.durationDays}`;
      if (params.planId && executedPlanKeys.has(planKey)) {
        // Idempotency: Return existing success without creating duplicate rows
        const currentTasks = await getPlannerTasks(context.userId);
        return {
          success: true,
          message: `Study plan '${params.subject}' has already been saved. No duplicate tasks created.`,
          data: { tasks: currentTasks.data || [] },
          link: { label: 'View in Planner', url: '/planner' },
        };
      }

      // If explicit tasks provided in params, use them; otherwise generate from subject & mastery
      let tasksToCreate: PlannerTaskPreview[] = params.tasks || [];

      if (!tasksToCreate.length) {
        const attempts = readLocalAttempts(context.userId);
        const subjectTopics = TOPICS.filter((t) => t.subjectId === params.subject || params.subject.includes(t.subjectId));
        const effectiveTopics = subjectTopics.length > 0 ? subjectTopics : TOPICS;

        const dayNames: ValidDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        tasksToCreate = Array.from({ length: params.durationDays }).map((_, idx) => {
          const topic = effectiveTopics[idx % effectiveTopics.length];
          const day = dayNames[idx % dayNames.length];
          const taskType = idx % 2 === 0 ? 'revision' : 'practice';
          return {
            day,
            name: `${taskType === 'revision' ? 'Revise' : 'Practice'}: ${topic.name}`,
            duration: `${params.dailyMinutes}m`,
            type: taskType,
            priority: idx === 0 ? 'high' : 'medium',
            topic: topic.id,
          };
        });
      }

      // Save to real database service
      const batchResult = await batchCreatePlannerTasks(
        context.userId,
        tasksToCreate.map((t) => ({
          day: t.day,
          name: t.name,
          duration: t.duration,
          type: t.type,
          priority: t.priority || 'medium',
          topic: t.topic,
          completed: false,
        }))
      );

      if (batchResult.error) {
        const errMsg = (batchResult.error as any)?.message || String(batchResult.error);
        return {
          success: false,
          error: `Failed to save planner tasks: ${errMsg}`,
        };
      }

      if (params.planId) {
        executedPlanKeys.add(planKey);
      }

      return {
        success: true,
        message: `Successfully created ${tasksToCreate.length} study tasks in your Planner.`,
        data: { tasks: batchResult.data },
        link: { label: 'View in Planner', url: '/planner' },
      };
    },
  },

  // 3. Add Single Planner Task
  add_planner_task: {
    id: 'add_planner_task',
    name: 'Add Planner Task',
    description: 'Schedules a specific revision or practice task in the Planner.',
    requiresConfirmation: () => true,
    validateParams: (raw: any) => {
      if (!raw || typeof raw !== 'object') {
        return { valid: false, error: 'Expected parameters object for task creation.' };
      }
      const name = String(raw.name || raw.title || '').trim();
      if (!name) return { valid: false, error: 'Task name is required.' };

      let day = String(raw.day || 'Mon').trim();
      // Capitalize first letter e.g. "mon" -> "Mon"
      day = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
      if (!VALID_DAYS.includes(day as ValidDay)) {
        day = 'Mon';
      }

      const duration = String(raw.duration || '30m').trim();
      const type = ['revision', 'practice', 'diagnostic', 'follow-up'].includes(raw.type)
        ? raw.type
        : 'practice';
      const priority = ['low', 'medium', 'high'].includes(raw.priority) ? raw.priority : 'medium';

      return {
        valid: true,
        cleanParams: {
          name,
          day: day as ValidDay,
          duration,
          type,
          priority,
          topic: raw.topic ? String(raw.topic) : undefined,
          user_id: raw.user_id ? String(raw.user_id) : undefined,
        },
      };
    },
    execute: async (params, context) => {
      assertAuthorizedUser(context, params.user_id);

      if (context.mockFailSaves) {
        return {
          success: false,
          error: 'Failed to create planner task due to database timeout.',
        };
      }

      const result = await createPlannerTask({
        user_id: context.userId,
        day: params.day,
        name: params.name,
        duration: params.duration,
        type: params.type,
        priority: params.priority,
        topic: params.topic,
        completed: false,
      });

      if (result.error) {
        const errMsg = (result.error as any)?.message || String(result.error);
        return {
          success: false,
          error: `Error creating task: ${errMsg}`,
        };
      }

      return {
        success: true,
        message: `Scheduled '${params.name}' for ${params.day} (${params.duration}).`,
        data: result.data,
        link: { label: 'Open Planner', url: '/planner' },
      };
    },
  },

  // 4. Complete Planner Task
  complete_planner_task: {
    id: 'complete_planner_task',
    name: 'Mark Task Completed',
    description: 'Marks an existing planner task as completed.',
    requiresConfirmation: () => true,
    validateParams: (raw: any) => {
      if (!raw || typeof raw !== 'object' || !raw.taskId) {
        return { valid: false, error: 'taskId parameter is required.' };
      }
      return {
        valid: true,
        cleanParams: {
          taskId: String(raw.taskId),
          user_id: raw.user_id ? String(raw.user_id) : undefined,
        },
      };
    },
    execute: async (params, context) => {
      assertAuthorizedUser(context, params.user_id);
      const res = await updatePlannerTask(params.taskId, true, context.userId);
      if (res.error) {
        const errMsg = (res.error as any)?.message || String(res.error);
        return { success: false, error: `Failed to update task: ${errMsg}` };
      }
      return {
        success: true,
        message: `Task ${params.taskId} marked as completed.`,
        data: res.data,
        link: { label: 'Open Planner', url: '/planner' },
      };
    },
  },

  // 5. Reschedule Task
  reschedule_planner_task: {
    id: 'reschedule_planner_task',
    name: 'Reschedule Task',
    description: 'Moves a planner task to another day.',
    requiresConfirmation: () => true,
    validateParams: (raw: any) => {
      if (!raw || typeof raw !== 'object' || !raw.taskId) {
        return { valid: false, error: 'taskId parameter is required.' };
      }
      let newDay = String(raw.newDay || raw.day || 'Mon').trim();
      newDay = newDay.charAt(0).toUpperCase() + newDay.slice(1).toLowerCase();
      if (!VALID_DAYS.includes(newDay as ValidDay)) {
        return { valid: false, error: `Invalid day '${raw.newDay}'. Allowed: ${VALID_DAYS.join(', ')}` };
      }
      return {
        valid: true,
        cleanParams: {
          taskId: String(raw.taskId),
          newDay: newDay as ValidDay,
          user_id: raw.user_id ? String(raw.user_id) : undefined,
        },
      };
    },
    execute: async (params, context) => {
      assertAuthorizedUser(context, params.user_id);
      const res = await updatePlannerTaskDetails(params.taskId, { day: params.newDay }, context.userId);
      if (res.error) {
        const errMsg = (res.error as any)?.message || String(res.error);
        return { success: false, error: `Failed to reschedule task: ${errMsg}` };
      }
      return {
        success: true,
        message: `Task rescheduled to ${params.newDay}.`,
        data: res.data,
        link: { label: 'Open Planner', url: '/planner' },
      };
    },
  },

  // 6. Delete Planner Task
  delete_planner_task: {
    id: 'delete_planner_task',
    name: 'Delete Planner Task',
    description: 'Removes a task from the study schedule.',
    requiresConfirmation: () => true,
    validateParams: (raw: any) => {
      if (!raw || typeof raw !== 'object' || !raw.taskId) {
        return { valid: false, error: 'taskId is required.' };
      }
      return {
        valid: true,
        cleanParams: {
          taskId: String(raw.taskId),
          user_id: raw.user_id ? String(raw.user_id) : undefined,
        },
      };
    },
    execute: async (params, context) => {
      assertAuthorizedUser(context, params.user_id);
      const res = await deletePlannerTask(params.taskId, context.userId);
      if (res.error) {
        const errMsg = (res.error as any)?.message || String(res.error);
        return { success: false, error: `Failed to delete task: ${errMsg}` };
      }
      return {
        success: true,
        message: `Task ${params.taskId} removed from Planner.`,
        data: res.data,
      };
    },
  },

  // 7. Start Quiz Action
  start_quiz: {
    id: 'start_quiz',
    name: 'Start Quiz Session',
    description: 'Launches an adaptive or diagnostic quiz on a specified topic.',
    requiresConfirmation: () => false,
    validateParams: (raw: any) => {
      if (!raw || typeof raw !== 'object') {
        return { valid: false, error: 'Expected parameters object for quiz.' };
      }
      const rawTopic = String(raw.topicId || raw.topic || 'python-functions').trim();
      const resolvedTopic = resolveTopicMetadata(rawTopic);
      const quizType = ['adaptive', 'diagnostic', 'standard'].includes(raw.quizType)
        ? raw.quizType
        : 'adaptive';
      const difficulty = raw.difficulty ? Math.min(5, Math.max(1, Number(raw.difficulty))) : undefined;

      return {
        valid: true,
        cleanParams: {
          topicId: resolvedTopic.id,
          topicName: resolvedTopic.name,
          quizType,
          difficulty,
        },
      };
    },
    execute: async (params, context) => {
      const route =
        params.quizType === 'diagnostic'
          ? '/practice/quiz'
          : `/practice/adaptive-quiz?topic=${encodeURIComponent(params.topicId)}&type=${params.quizType}${
              params.difficulty ? `&difficulty=${params.difficulty}` : ''
            }`;

      if (context.navigate) {
        context.navigate(route);
      }

      return {
        success: true,
        message: `Starting ${params.quizType} quiz on ${params.topicName}.`,
        executedRoute: route,
        link: { label: `Start Quiz: ${params.topicName}`, url: route },
      };
    },
  },

  // 8. Review Mistakes Action
  review_mistakes: {
    id: 'review_mistakes',
    name: 'Review Mistakes',
    description: 'Opens Mistake Review for recurring misconceptions.',
    requiresConfirmation: () => false,
    validateParams: (raw: any) => {
      const topicId = raw?.topicId ? String(raw.topicId) : undefined;
      return {
        valid: true,
        cleanParams: { topicId },
      };
    },
    execute: async (params, context) => {
      const route = params.topicId
        ? `/practice/mistake-review?topic=${encodeURIComponent(params.topicId)}`
        : '/practice/mistake-review';

      if (context.navigate) {
        context.navigate(route);
      }

      return {
        success: true,
        message: 'Opened Mistake Review.',
        executedRoute: route,
        link: { label: 'Open Mistake Review', url: route },
      };
    },
  },

  // 9. Recommend Next Action
  recommend_next_action: {
    id: 'recommend_next_action',
    name: 'Recommend Next Learning Step',
    description: 'Inspects real learner attempts and calculates adaptive next step.',
    requiresConfirmation: () => false,
    validateParams: (raw: any) => {
      const focus = ['weakest', 'next_topic', 'revision'].includes(raw?.focus)
        ? raw.focus
        : 'weakest';
      return { valid: true, cleanParams: { focus } };
    },
    execute: async (params, context) => {
      const attempts = readLocalAttempts(context.userId);
      const snapshot = buildLearnerAnalyticsSnapshot(context.userId, attempts);
      const nextAction = snapshot.nextLearningAction;

      return {
        success: true,
        message: `Recommended: ${nextAction.nextTopicName} — ${nextAction.strategyReason}`,
        data: nextAction,
        link: {
          label: `Start: ${nextAction.nextTopicName}`,
          url: `/practice/adaptive-quiz?topic=${encodeURIComponent(nextAction.nextTopicId)}`,
        },
      };
    },
  },

  // 10. Explain Concept
  explain_concept: {
    id: 'explain_concept',
    name: 'Explain Concept',
    description: 'Pedagogical explanation tailored to active learning strategy.',
    requiresConfirmation: () => false,
    validateParams: (raw: any) => {
      const concept = String(raw?.concept || raw?.topic || '').trim();
      if (!concept) return { valid: false, error: 'Concept or topic is required.' };
      return { valid: true, cleanParams: { concept } };
    },
    execute: async (params) => {
      return {
        success: true,
        message: `Explaining concept: ${params.concept}`,
        data: { concept: params.concept },
      };
    },
  },

  // 11. Open Materials
  open_materials: {
    id: 'open_materials',
    name: 'Open Materials',
    description: 'Opens uploaded study documents and notes.',
    requiresConfirmation: () => false,
    validateParams: () => ({ valid: true, cleanParams: {} }),
    execute: async (_, context) => {
      if (context.navigate) {
        context.navigate('/materials');
      }
      return {
        success: true,
        message: 'Opened Study Materials.',
        executedRoute: '/materials',
        link: { label: 'Study Materials', url: '/materials' },
      };
    },
  },

  // 12. Summarize Material
  summarize_material: {
    id: 'summarize_material',
    name: 'Summarize Study Material',
    description: 'Summarizes a selected document from study materials.',
    requiresConfirmation: () => false,
    validateParams: (raw: any) => {
      const materialId = raw?.materialId ? String(raw.materialId) : undefined;
      const title = raw?.title ? String(raw.title) : undefined;
      return { valid: true, cleanParams: { materialId, title } };
    },
    execute: async (params) => {
      return {
        success: true,
        message: `Summarizing material ${params.title || params.materialId || ''}.`,
        link: { label: 'Open Materials', url: '/materials' },
      };
    },
  },

  // 13. Open Voice Mode
  open_voice_mode: {
    id: 'open_voice_mode',
    name: 'Open Voice Mode',
    description: 'Activates hands-free speech recognition and audio response.',
    requiresConfirmation: () => false,
    validateParams: () => ({ valid: true, cleanParams: {} }),
    execute: async (_, context) => {
      if (context.openVoiceMode) {
        context.openVoiceMode();
      }
      return {
        success: true,
        message: 'Mate AI voice mode activated.',
        executedRoute: '/learn',
      };
    },
  },

  // 14. Ask Clarification
  ask_clarification: {
    id: 'ask_clarification',
    name: 'Ask Clarification',
    description: 'Requests specific missing information from user before taking action.',
    requiresConfirmation: () => false,
    validateParams: (raw: any) => {
      const question = String(raw?.question || '').trim();
      return { valid: true, cleanParams: { question } };
    },
    execute: async (params) => {
      return {
        success: true,
        message: params.question || 'Could you provide a few more details so I can assist you?',
      };
    },
  },

  // 15. Unsupported / Arbitrary execution rejector
  unsupported: {
    id: 'unsupported',
    name: 'Unsupported Action',
    description: 'Safety barrier rejecting arbitrary shell, code, database, or purchase requests.',
    requiresConfirmation: () => false,
    validateParams: (raw: any) => ({
      valid: true,
      cleanParams: { reason: String(raw?.reason || 'Operation not permitted.') },
    }),
    execute: async (params) => {
      return {
        success: false,
        error: `I cannot perform this operation: ${params.reason} MindMate Mate AI only executes verified study, planning, and quiz actions.`,
      };
    },
  },
};
