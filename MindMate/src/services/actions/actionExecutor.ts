/**
 * MindMate Action Executor
 *
 * Orchestrates safe step-by-step execution of ActionPlans. Enforces confirmation barriers,
 * records step state transitions, handles partial failures honestly, and maintains idempotency.
 */

import {
  ActionExecutionContext,
  ActionExecutionResult,
  ActionPlan,
  ActionPlanStep,
  PlanOverallStatus,
} from './types';
import { actionRegistry } from './actionRegistry';

export interface ExecutePlanOptions {
  confirmedStepIds?: string[];
  onStepProgress?: (step: ActionPlanStep, updatedPlan: ActionPlan) => void;
}

/**
 * Executes an ActionPlan safely against real application services.
 */
export async function executeActionPlan(
  plan: ActionPlan,
  context: ActionExecutionContext,
  options: ExecutePlanOptions = {}
): Promise<{ plan: ActionPlan; lastResult?: ActionExecutionResult }> {
  const confirmedIds = new Set(options.confirmedStepIds || []);
  let hasFailure = false;
  let hasSuccess = false;
  let lastResult: ActionExecutionResult | undefined;

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];

    // 1. If step is already succeeded, do not repeat (idempotent)
    if (step.state === 'succeeded') {
      hasSuccess = true;
      continue;
    }

    // 2. If step is cancelled, skip
    if (step.state === 'cancelled') {
      continue;
    }

    // 3. Confirmation barrier: If step requires confirmation and not confirmed, halt!
    if (step.requiresConfirmation && !confirmedIds.has(step.id)) {
      step.state = 'awaiting_confirmation';
      plan.status = 'awaiting_confirmation';
      if (options.onStepProgress) options.onStepProgress(step, plan);
      return { plan, lastResult };
    }

    // 4. Execute the step
    const definition = actionRegistry[step.action];
    if (!definition) {
      step.state = 'failed';
      step.error = `Action handler for '${step.action}' is not registered.`;
      hasFailure = true;
      break;
    }

    step.state = 'running';
    plan.status = 'executing';
    if (options.onStepProgress) options.onStepProgress(step, plan);

    try {
      const res = await definition.execute(step.params, context);
      lastResult = res;

      if (res.success) {
        step.state = 'succeeded';
        step.result = res.data;
        if (res.link) step.link = res.link;
        hasSuccess = true;
      } else {
        step.state = 'failed';
        step.error = res.error || 'Operation failed.';
        hasFailure = true;
        // Multi-step failure: Halt subsequent steps so partial state is safely reported
        break;
      }
    } catch (err: any) {
      step.state = 'failed';
      step.error = err.message || 'Unexpected execution error.';
      hasFailure = true;
      lastResult = { success: false, error: step.error };
      break;
    }

    if (options.onStepProgress) options.onStepProgress(step, plan);
  }

  // 5. Update overall plan status honestly
  if (hasFailure && hasSuccess) {
    plan.status = 'partial_failure';
    plan.error = 'Some operations succeeded while others failed. See step details.';
  } else if (hasFailure) {
    plan.status = 'failed';
    plan.error = plan.steps.find((s) => s.state === 'failed')?.error || 'Action execution failed.';
  } else if (plan.steps.every((s) => s.state === 'succeeded')) {
    plan.status = 'completed';
    plan.completedAt = Date.now();
  } else if (plan.steps.some((s) => s.state === 'awaiting_confirmation')) {
    plan.status = 'awaiting_confirmation';
  }

  return { plan, lastResult };
}

/**
 * Cancels a pending or awaiting-confirmation plan cleanly.
 */
export function cancelActionPlan(plan: ActionPlan): ActionPlan {
  const updatedSteps = plan.steps.map((s) =>
    s.state === 'awaiting_confirmation' || s.state === 'pending'
      ? { ...s, state: 'cancelled' as const }
      : s
  );

  return {
    ...plan,
    status: 'cancelled',
    steps: updatedSteps,
    summary: 'Action plan was cancelled by the user.',
  };
}
