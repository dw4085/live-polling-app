import type { AnswerOption as AnswerOptionType } from '../../types';

interface AnswerOptionProps {
  option: AnswerOptionType;
  isSelected: boolean;
  onSelect: () => void;
}

export function AnswerOption({ option, isSelected, onSelect }: AnswerOptionProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full p-4 rounded-lg border-2 text-left transition-all duration-200 flex items-center gap-3 ${
        isSelected
          ? 'border-navy bg-columbia-blue/20'
          : 'border-gray-200 hover:border-columbia-blue hover:bg-gray-50'
      }`}
      aria-pressed={isSelected}
    >
      {/* Radio circle */}
      <span className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
        isSelected ? 'border-navy bg-navy' : 'border-gray-300'
      }`}>
        {isSelected && (
          <svg
            className="w-3 h-3 text-white animate-checkmark"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </span>

      {/* Option text */}
      <span className={`text-base ${isSelected ? 'text-navy font-medium' : 'text-gray-700'}`}>
        {option.option_text}
      </span>
    </button>
  );
}
