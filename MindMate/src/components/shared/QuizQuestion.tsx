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
      <Card className="p-6 md:p-8 text-center bg-[#F8FAFC] border border-[#E2E8F0] shadow-xs">
        <h3 className="text-xl md:text-2xl font-semibold text-dark leading-relaxed">
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
                "w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between shadow-2xs",
                {
                  "border-[#E2E8F0] bg-surface text-dark hover:border-[#4F46E5] hover:bg-[#F8FAFC]": !isAnswered && !isSelected,
                  "border-[#4F46E5] bg-[#EEF2FF] text-[#1E1B4B] ring-2 ring-[#4F46E5]/20 font-semibold": !isAnswered && isSelected,
                  "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857] font-semibold ring-2 ring-[#047857]/20": showCorrect,
                  "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] font-semibold ring-2 ring-[#B91C1C]/20": showWrong,
                  "border-[#E2E8F0] bg-[#F8FAFC] opacity-60 text-muted": isAnswered && !isSelected && !isCorrect,
                }
              )}
            >
              <span className="font-medium">{option}</span>
              {showCorrect && <CheckCircle className="h-5 w-5 text-[#047857] shrink-0" />}
              {showWrong && <XCircle className="h-5 w-5 text-[#B91C1C] shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
