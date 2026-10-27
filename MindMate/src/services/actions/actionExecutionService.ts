/**
 * MindMate Action Execution Service
 *
 * Central coordinator linking user messages (text or voice), intent planning,
 * user confirmation barriers, execution against real app services, and event dispatch.
 */

import {
  ActionExecutionContext,
  ActionExecutionResult,
  ActionPlan,
  ActionStepState,
  ActionType,
} from './types';
import {
  parseDeterministicAction,
  validateActionProposal,
} from './actionPlanner';
import {
  executeActionPlan,
  cancelActionPlan,
} from './actionExecutor';
import { actionRegistry } from './actionRegistry';
import { ollamaAdapter } from '../ai/ollamaAdapter';
import type { AIMode } from '../ai/types';

export type ActionEvent =
  | { type: 'plan_created'; plan: ActionPlan }
  | { type: 'step_progress'; plan: ActionPlan; stepId: string; state: ActionStepState }
  | { type: 'plan_completed'; plan: ActionPlan; result?: ActionExecutionResult }
  | { type: 'plan_failed'; plan: ActionPlan; error: string }
  | { type: 'plan_cancelled'; plan: ActionPlan };

export type ActionListener = (event: ActionEvent) => void;

class ActionExecutionService {
  private plans = new Map<string, ActionPlan>();
  private listeners = new Set<ActionListener>();

  public subscribe(listener: ActionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: ActionEvent): void {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('Error in action listener:', err);
      }
    });
  }

  public getPlan(planId: string): ActionPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * Evaluates user input. If an action is detected, creates a plan.
   * If low-risk steps do not require confirmation (e.g. navigation, quiz start),
   * executes immediately; if high-risk steps require confirmation, halts at awaiting_confirmation.
   */
  public async handleUserInput(
    userInput: string,
    context: ActionExecutionContext,
    aiMode: AIMode = 'ollama',
    modelName: string = 'gemma4:e2b-it-qat'
  ): Promise<{ isAction: boolean; plan?: ActionPlan; result?: ActionExecutionResult }> {
    // 1. High-precision deterministic parser first
    let plan = parseDeterministicAction(userInput, context);

    // 2. If no deterministic action was matched and Ollama is enabled, query Gemma 4 for tool proposals
    if (!plan && aiMode === 'ollama') {
      try {
        const proposal = await this.queryGemmaForActionProposal(userInput, modelName);
        if (proposal && proposal.action && actionRegistry[proposal.action as ActionType]) {
          const validated = validateActionProposal(proposal);
          if (validated.valid && validated.proposal) {
            const def = actionRegistry[validated.proposal.action as ActionType];
            const planId = `plan-llm-${Date.now()}`;
            const reqConf = def.requiresConfirmation(validated.proposal.params);
            plan = {
              id: planId,
              userIntent: userInput,
              status: reqConf ? 'awaiting_confirmation' : 'draft',
              summary: validated.proposal.explanation || `Executing ${def.name}...`,
              steps: [
                {
                  id: `step-${Date.now()}`,
                  action: validated.proposal.action,
                  title: def.name,
                  description: def.description,
                  params: validated.proposal.params,
                  state: reqConf ? 'awaiting_confirmation' : 'pending',
                  requiresConfirmation: reqConf,
                },
              ],
              createdAt: Date.now(),
            };
          }
        }
      } catch (err) {
        // Fall back gracefully to ordinary conversational response
        console.warn('Gemma 4 action proposal check bypassed:', err);
      }
    }

    if (!plan) {
      return { isAction: false };
    }

    this.plans.set(plan.id, plan);
    this.notify({ type: 'plan_created', plan });

    // 3. If plan already failed (e.g. unsupported request), return immediately
    if (plan.status === 'failed') {
      this.notify({ type: 'plan_failed', plan, error: plan.error || 'Blocked' });
      return { isAction: true, plan };
    }

    // 4. If any step requires confirmation, hold execution and return preview
    const needsConfirmation = plan.steps.some((s) => s.requiresConfirmation);
    if (needsConfirmation) {
      plan.status = 'awaiting_confirmation';
      return { isAction: true, plan };
    }

    // 5. Low-risk actions (navigation, quiz start, recommendations) execute directly
    const execResult = await executeActionPlan(plan, context, {
      onStepProgress: (step, updatedPlan) => {
        this.notify({
          type: 'step_progress',
          plan: updatedPlan,
          stepId: step.id,
          state: step.state,
        });
      },
    });

    if (execResult.plan.status === 'completed') {
      this.notify({ type: 'plan_completed', plan: execResult.plan, result: execResult.lastResult });
    } else if (execResult.plan.status === 'failed' || execResult.plan.status === 'partial_failure') {
      this.notify({
        type: 'plan_failed',
        plan: execResult.plan,
        error: execResult.plan.error || 'Execution failed',
      });
    }

    return { isAction: true, plan: execResult.plan, result: execResult.lastResult };
  }

  /**
   * Confirms a plan that was paused at awaiting_confirmation and executes the confirmed steps.
   */
  public async confirmPlan(
    planId: string,
    context: ActionExecutionContext
  ): Promise<{ plan: ActionPlan; result?: ActionExecutionResult }> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found.`);
    }

    const confirmedStepIds = plan.steps.map((s) => s.id);
    plan.confirmedAt = Date.now();

    const execResult = await executeActionPlan(plan, context, {
      confirmedStepIds,
      onStepProgress: (step, updatedPlan) => {
        this.notify({
          type: 'step_progress',
          plan: updatedPlan,
          stepId: step.id,
          state: step.state,
        });
      },
    });

    if (execResult.plan.status === 'completed') {
      this.notify({ type: 'plan_completed', plan: execResult.plan, result: execResult.lastResult });
    } else if (execResult.plan.status === 'failed' || execResult.plan.status === 'partial_failure') {
      this.notify({
        type: 'plan_failed',
        plan: execResult.plan,
        error: execResult.plan.error || 'Execution failed',
      });
    }

    return { plan: execResult.plan, result: execResult.lastResult };
  }

  /**
   * Cancels a pending plan.
   */
  public cancelPlan(planId: string): ActionPlan {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found.`);

    const cancelled = cancelActionPlan(plan);
    this.plans.set(planId, cancelled);
    this.notify({ type: 'plan_cancelled', plan: cancelled });
    return cancelled;
  }

  /**
   * Queries Ollama with structured JSON prompt for conversational action discovery.
   */
  private async queryGemmaForActionProposal(
    userInput: string,
    modelName: string
  ): Promise<any | null> {
    const systemPrompt = `You are MindMate Mate AI's Action Classifier.
Analyze the user's message and determine if they want to execute an application action.
Available actions:
- navigate_page (params: target: 'planner' | 'progress' | 'insights' | 'learning-twin' | 'practice' | 'mistakes' | 'materials')
- create_study_plan (params: subject: string, durationDays: number, dailyMinutes: number)
- add_planner_task (params: name: string, day: 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun', duration: string, type: 'revision'|'practice')
- start_quiz (params: topicId: string, quizType: 'adaptive'|'diagnostic')
- recommend_next_action (params: focus: 'weakest')

If the message is an educational question (e.g. "What is recursion?", "Explain OOP"), respond with {"action": null}.
Otherwise respond ONLY with a valid JSON object matching:
{"action": "action_name", "params": {...}, "explanation": "brief description"}
Do NOT include markdown formatting or extra text.`;

    try {
      const response = await fetch('/ollama/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userInput },
          ],
          stream: false,
          format: 'json',
          options: { temperature: 0.1 },
        }),
      });

      if (!response.ok) return null;
      const data = await response.json();
      const content = data?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content);
      return parsed.action ? parsed : null;
    } catch {
      return null;
    }
  }
}

export const actionExecutionService = new ActionExecutionService();
