import { useSession } from '../../contexts/SessionContext';
import { AnswerOption } from './AnswerOption';
import type { Question } from '../../types';

interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  selectedAnswer?: string | string[];
}

export function QuestionCard({ question, questionNumber, selectedAnswer }: QuestionCardProps) {
  const { saveResponse, saveMultiResponse } = useSession();
  const isMultiSelect = question.allow_multiple;

  const handleSelect = async (optionId: string) => {
    if (isMultiSelect) {
      // Toggle option in/out of selected array
      const currentSelections = Array.isArray(selectedAnswer)
        ? selectedAnswer
        : selectedAnswer
          ? [selectedAnswer]
          : [];

      const newSelections = currentSelections.includes(optionId)
        ? currentSelections.filter(id => id !== optionId)
        : [...currentSelections, optionId];

      await saveMultiResponse(question.id, newSelections);
    } else {
      await saveResponse(question.id, optionId);
    }
  };

  const isOptionSelected = (optionId: string): boolean => {
    if (Array.isArray(selectedAnswer)) {
      return selectedAnswer.includes(optionId);
    }
    return selectedAnswer === optionId;
  };

  const options = question.answer_options || [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-navy text-white flex items-center justify-center text-sm font-semibold">
            {questionNumber}
          </span>
          <div>
            <h2 className="text-lg font-medium text-gray-900 pt-1">
              {question.question_text}
            </h2>
            {isMultiSelect && (
              <p className="text-sm text-gray-500 mt-1">Check all that apply</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="space-y-3">
          {options
            .sort((a, b) => a.option_order - b.option_order)
            .map((option) => (
              <AnswerOption
                key={option.id}
                option={option}
                isSelected={isOptionSelected(option.id)}
                isMultiSelect={isMultiSelect}
                onSelect={() => handleSelect(option.id)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
