/**
 * MindMate Advanced Action Execution Engine Types
 *
 * Provides a strongly-typed, schema-validated contract for all actions that Mate AI
 * can plan, preview, confirm, and execute across the application.
 */

export type ActionType =
  | 'navigate_page'
  | 'create_study_plan'
  | 'add_planner_task'
  | 'complete_planner_task'
  | 'reschedule_planner_task'
  | 'delete_planner_task'
  | 'start_quiz'
  | 'review_mistakes'
  | 'recommend_next_action'
  | 'explain_concept'
  | 'open_materials'
  | 'summarize_material'
  | 'open_voice_mode'
  | 'ask_clarification'
  | 'unsupported';

export type ActionStepState =
  | 'pending'
  | 'awaiting_confirmation'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type PlanOverallStatus =
  | 'draft'
  | 'awaiting_confirmation'
  | 'executing'
  | 'completed'
  | 'partial_failure'
  | 'failed'
  | 'cancelled';

export type SupportedPageTarget =
  | 'planner'
  | 'progress'
  | 'insights'
  | 'learning-twin'
  | 'practice'
  | 'practice-adaptive'
  | 'practice-quiz'
  | 'mistakes'
  | 'materials'
  | 'home'
  | 'settings'
  | 'zoom'
  | 'voice';

export interface ActionLink {
  label: string;
  url: string;
}

export interface PlannerTaskPreview {
  id?: string;
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  name: string;
  duration: string;
  type: 'revision' | 'practice' | 'diagnostic' | 'follow-up';
  priority?: 'low' | 'medium' | 'high';
  topic?: string;
}

export interface ActionPlanStep {
  id: string;
  action: ActionType;
  title: string;
  description: string;
  params: Record<string, any>;
  state: ActionStepState;
  requiresConfirmation: boolean;
  result?: any;
  error?: string;
  link?: ActionLink;
  previewData?: {
    tasks?: PlannerTaskPreview[];
    targetRoute?: string;
    targetTopic?: string;
    details?: string;
  };
}

export interface ActionPlan {
  id: string;
  planId?: string; // Idempotency key
  userIntent: string;
  status: PlanOverallStatus;
  summary: string;
  steps: ActionPlanStep[];
  createdAt: number;
  confirmedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface ActionProposal {
  action: ActionType;
  params: Record<string, any>;
  explanation?: string;
  confidence?: number;
}

export interface ActionExecutionContext {
  userId: string;
  userName?: string;
  activeTopic?: string;
  subjectId?: string;
  navigate?: (path: string) => void;
  openVoiceMode?: () => void;
  stopSpeaking?: () => void;
  repeatAnswer?: () => void;
  now?: Date;
  mockFailSaves?: boolean; // For testing resilient failure reporting
}

export interface ActionExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  link?: ActionLink;
  executedRoute?: string;
}

export interface ActionDefinition<TParams = any> {
  id: ActionType;
  name: string;
  description: string;
  requiresConfirmation: (params: TParams) => boolean;
  validateParams: (params: unknown) => { valid: boolean; error?: string; cleanParams?: TParams };
  execute: (params: TParams, context: ActionExecutionContext) => Promise<ActionExecutionResult>;
}
