import React from 'react';
import { QuizQuestion as QuizQuestionType } from '../../types';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { cn } from '../../utils';
import { CheckCircle, XCircle } from 'lucide-react';

interface QuizQuestionProps {
  question: QuizQuestionType;
  selectedOption: number | null;
  onSelectOption: (index: number) => void;
  isAnswered: boolean;
}

export function QuizQuestion({ question, selectedOption, onSelectOption, isAnswered }: QuizQuestionProps) {
  return (
    <div className="space-y-6">
      <Card className="p-6 md:p-8 text-center bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-950/50">
        <h3 className="text-xl md:text-2xl font-medium text-dark">
          {question.question}
        </h3>
      </Card>

      <div className="grid grid-cols-1 gap-3">
        {question.options.map((option, index) => {
          const isSelected = selectedOption === index;
          const isCorrect = question.correct === index;
          const showCorrect = isAnswered && isCorrect;
          const showWrong = isAnswered && isSelected && !isCorrect;

          return (
            <button
              key={index}
              disabled={isAnswered}
              onClick={() => onSelectOption(index)}
              className={cn(
                "w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between",
                {
                  "border-border bg-surface text-dark hover:border-primary/50 hover:bg-gray-50 dark:hover:bg-slate-800": !isAnswered && !isSelected,
                  "border-primary bg-indigo-50 dark:bg-indigo-950/40 text-dark ring-2 ring-primary ring-opacity-50": !isAnswered && isSelected,
                  "border-success bg-green-50 dark:bg-emerald-950/40 text-green-900 dark:text-emerald-200": showCorrect,
                  "border-danger bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200": showWrong,
                  "border-border bg-gray-50 dark:bg-slate-800/40 opacity-50 text-muted": isAnswered && !isSelected && !isCorrect,
                }
              )}
            >
              <span className="font-medium">{option}</span>
              {showCorrect && <CheckCircle className="h-5 w-5 text-success" />}
              {showWrong && <XCircle className="h-5 w-5 text-danger" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
