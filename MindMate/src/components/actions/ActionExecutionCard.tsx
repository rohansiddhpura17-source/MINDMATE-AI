import React, { useState } from 'react';
import {
  ActionPlan,
  ActionPlanStep,
  ActionStepState,
  actionExecutionService,
} from '../../services/actions';
import { useAppContext } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Calendar,
  ExternalLink,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  ListTodo,
} from 'lucide-react';
import { Button } from '../ui/Button';

interface ActionExecutionCardProps {
  plan: ActionPlan;
  onPlanUpdate?: (updatedPlan: ActionPlan) => void;
}

export const ActionExecutionCard: React.FC<ActionExecutionCardProps> = ({
  plan: initialPlan,
  onPlanUpdate,
}) => {
  const { user } = useAppContext();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<ActionPlan>(initialPlan);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const context = {
    userId: user?.id || 'guest',
    userName: user?.name,
    navigate: (path: string) => navigate(path),
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await actionExecutionService.confirmPlan(plan.id, context);
      setPlan(res.plan);
      if (onPlanUpdate) onPlanUpdate(res.plan);
    } catch (err: any) {
      setActionError(err.message || 'Failed to save confirmed action plan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    try {
      const cancelled = actionExecutionService.cancelPlan(plan.id);
      setPlan(cancelled);
      if (onPlanUpdate) onPlanUpdate(cancelled);
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel plan.');
    }
  };

  const handleRetry = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await actionExecutionService.confirmPlan(plan.id, context);
      setPlan(res.plan);
      if (onPlanUpdate) onPlanUpdate(res.plan);
    } catch (err: any) {
      setActionError(err.message || 'Retry failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine overall status colors and badges
  const getStatusBadge = () => {
    switch (plan.status) {
      case 'awaiting_confirmation':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5" /> Awaiting Confirmation
          </span>
        );
      case 'executing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed
          </span>
        );
      case 'partial_failure':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <AlertCircle className="w-3.5 h-3.5" /> Partially Completed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5" /> Action Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  const renderStepIcon = (state: ActionStepState) => {
    switch (state) {
      case 'succeeded':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-rose-600" />;
      case 'awaiting_confirmation':
        return <Clock className="w-4 h-4 text-amber-500" />;
      default:
        return <div className="w-2 h-2 rounded-full bg-slate-300 ml-1" />;
    }
  };

  // Extract preview tasks if present across steps
  const previewTasks = plan.steps.flatMap((s) => s.previewData?.tasks || []);

  return (
    <div className="my-3 rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition-all">
      {/* Top Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Mate Action Engine
            </h4>
            <p className="text-sm font-semibold text-slate-900 line-clamp-1">
              {plan.userIntent}
            </p>
          </div>
        </div>
        <div>{getStatusBadge()}</div>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary Description */}
        <p className="text-sm text-slate-700 leading-relaxed">{plan.summary}</p>

        {/* Step-by-Step Execution Pipeline */}
        <div className="space-y-2 border border-slate-100 bg-slate-50/50 rounded-lg p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Execution Steps
          </div>
          {plan.steps.map((step, idx) => (
            <div
              key={step.id}
              className="flex items-start gap-2.5 text-xs text-slate-700 py-1 border-b border-slate-100 last:border-b-0"
            >
              <div className="mt-0.5 shrink-0">{renderStepIcon(step.state)}</div>
              <div className="flex-1">
                <div className="font-medium text-slate-900 flex items-center gap-2">
                  <span>{step.title}</span>
                  {step.state === 'awaiting_confirmation' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                      Requires Approval
                    </span>
                  )}
                </div>
                <div className="text-slate-500 text-[11px] mt-0.5">{step.description}</div>
                {step.error && (
                  <div className="text-rose-600 font-medium text-[11px] mt-1 bg-rose-50 p-1.5 rounded border border-rose-100">
                    {step.error}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Multi-Day Task Preview Table (if study plan proposal) */}
        {previewTasks.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100/70 px-3 py-2 text-xs font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                Proposed Study Schedule Preview ({previewTasks.length} sessions)
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                Not saved until confirmed
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {previewTasks.map((task, i) => (
                <div
                  key={task.id || i}
                  className="px-3 py-2 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/60"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 shrink-0 font-bold text-slate-700 text-[11px]">
                      {task.day}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        task.type === 'revision'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {task.type}
                    </span>
                    <span className="font-medium text-slate-800 truncate">{task.name}</span>
                  </div>
                  <span className="text-slate-500 shrink-0 font-mono text-[11px]">
                    {task.duration}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error notification if any */}
        {(actionError || plan.error) && plan.status !== 'completed' && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Action could not be completed: </span>
              {actionError || plan.error}
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
          {/* Confirmation buttons */}
          {plan.status === 'awaiting_confirmation' && (
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving Tasks...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Confirm & Save Plan
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Retry on failure */}
          {(plan.status === 'failed' || plan.status === 'partial_failure') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRetry}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Retry Action
            </Button>
          )}

          {/* Result / Success Links */}
          {plan.status === 'completed' && (
            <div className="flex items-center gap-2">
              {plan.steps
                .filter((s) => s.link)
                .map((s, idx) => (
                  <Button
                    key={idx}
                    variant="primary"
                    size="sm"
                    onClick={() => s.link && navigate(s.link.url)}
                    className="gap-1.5"
                  >
                    <span>{s.link?.label}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
