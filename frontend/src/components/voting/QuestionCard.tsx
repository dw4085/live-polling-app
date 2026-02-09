import { useSession } from '../../contexts/SessionContext';
import { AnswerOption } from './AnswerOption';
import type { Question } from '../../types';

interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  selectedAnswer?: string;
}

export function QuestionCard({ question, questionNumber, selectedAnswer }: QuestionCardProps) {
  const { saveResponse } = useSession();

  const handleSelect = async (optionId: string) => {
    await saveResponse(question.id, optionId);
  };

  const options = question.answer_options || [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-navy text-white flex items-center justify-center text-sm font-semibold">
            {questionNumber}
          </span>
          <h2 className="text-lg font-medium text-gray-900 pt-1">
            {question.question_text}
          </h2>
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
                isSelected={selectedAnswer === option.id}
                onSelect={() => handleSelect(option.id)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
