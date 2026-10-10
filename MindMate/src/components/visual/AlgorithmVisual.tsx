import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Zap,
  CheckCircle2,
  Clock,
  Layers
} from 'lucide-react';
import { VisualAlgorithmData } from '../../services/visual/types';

interface AlgorithmVisualProps {
  algorithm: VisualAlgorithmData;
  topic: string;
}

export function AlgorithmVisual({ algorithm, topic }: AlgorithmVisualProps) {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const steps = algorithm.steps || [];
  const maxStep = Math.max(steps.length - 1, 0);
  const activeStepData = steps[currentStep] || steps[0];

  // Auto-play timer
  useEffect(() => {
    let interval: any = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= maxStep) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, maxStep]);

  const handlePrev = () => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleNext = () => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.min(prev + 1, maxStep));
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStep(0);
  };

  const handleTogglePlay = () => {
    if (currentStep >= maxStep) {
      setCurrentStep(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Complexity Info */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div>
          <h4 className="font-semibold text-dark flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-amber-500" />
            {algorithm.algorithmName || `${topic} Algorithm`}
          </h4>
          <p className="text-muted text-[11px] mt-0.5">{algorithm.description}</p>
        </div>

        {algorithm.complexity && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-mono border border-indigo-100">
              <Clock className="h-3 w-3" />
              Time: {algorithm.complexity.time}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-mono border border-emerald-100">
              <Layers className="h-3 w-3" />
              Space: {algorithm.complexity.space}
            </span>
          </div>
        )}
      </div>

      {/* Stepper Control Bar */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-border shadow-2xs text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-dark text-xs">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-muted hidden sm:inline">•</span>
          <span className="text-primary font-medium text-[11px] hidden sm:inline">
            {activeStepData?.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg text-muted hover:text-dark hover:bg-gray-100 transition-colors"
            title="Reset to Step 1"
            aria-label="Reset"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="px-2.5 py-1 rounded-lg border border-border bg-white text-dark disabled:opacity-40 hover:bg-gray-50 transition-colors flex items-center gap-1 font-medium"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </button>
          <button
            onClick={handleTogglePlay}
            className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1 font-medium"
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" /> Pause
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" /> Auto-Play
              </>
            )}
          </button>
          <button
            onClick={handleNext}
            disabled={currentStep === maxStep}
            className="px-2.5 py-1 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center gap-1 font-medium shadow-2xs"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Visual Stage */}
      <div className="p-5 rounded-xl border border-border bg-slate-50/60 flex flex-col items-center justify-center space-y-5">
        {/* Array / Elements Row */}
        {activeStepData?.items && activeStepData.items.length > 0 && (
          <div className="w-full overflow-x-auto py-3">
            <div className="flex items-center justify-center gap-2 min-w-max px-2">
              {activeStepData.items.map((item, idx) => {
                const pointerLabel = activeStepData.pointerLabels?.[idx];
                const isFound = item.status === 'found';
                const isActive = item.status === 'active';
                const isEliminated = item.status === 'eliminated';

                return (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    {/* Pointer Label above element */}
                    <div className="h-5 text-[10px] font-bold text-indigo-600 truncate">
                      {pointerLabel || ''}
                    </div>

                    {/* Array Cell */}
                    <div
                      className={`w-11 h-12 rounded-lg flex items-center justify-center font-mono text-sm font-semibold border-2 transition-all duration-300 shadow-2xs ${
                        isFound
                          ? 'bg-emerald-500 text-white border-emerald-600 scale-110 shadow-md ring-2 ring-emerald-300'
                          : isActive
                          ? 'bg-indigo-600 text-white border-indigo-700 scale-105 shadow-sm'
                          : isEliminated
                          ? 'bg-gray-100 text-gray-400 border-gray-200 opacity-40 line-through'
                          : 'bg-white text-dark border-gray-300'
                      }`}
                    >
                      {item.value}
                    </div>

                    {/* Array Index below cell */}
                    <span className="text-[10px] text-muted font-mono">[{idx}]</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step Explanation Card */}
        <div className="w-full bg-white p-3.5 rounded-xl border border-border shadow-2xs text-xs space-y-1.5 text-left">
          <p className="font-semibold text-dark flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            {activeStepData?.title}
          </p>
          <p className="text-dark/80 leading-relaxed">{activeStepData?.description}</p>
          {activeStepData?.stateSummary && (
            <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] font-mono text-indigo-800 bg-indigo-50/70 px-2.5 py-1.5 rounded-lg">
              {activeStepData.stateSummary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
