interface ProgressIndicatorProps {
  answered: number;
  total: number;
}

export function ProgressIndicator({ answered, total }: ProgressIndicatorProps) {
  if (total === 0) return null;

  const percentage = (answered / total) * 100;
  const isComplete = answered === total;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-columbia-blue">
        {answered} of {total}
      </span>
      <div className="w-20 h-2 bg-white/20 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            isComplete ? 'bg-green-400' : 'bg-columbia-blue'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isComplete && (
        <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </div>
  );
}
