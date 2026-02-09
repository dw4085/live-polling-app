import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import type { Question, ChartType, AnswerOption } from '../../types';

interface QuestionEditorProps {
  question: Question;
  questionNumber: number;
  onUpdate: (updates: Partial<Question>) => void;
  onDelete: () => void;
  onReveal: (reveal: boolean) => void;
  onToggleVisibility: (visible: boolean) => void;
}

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'horizontal_bar', label: 'Horizontal Bar' },
  { value: 'vertical_bar', label: 'Vertical Bar' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'donut', label: 'Donut Chart' }
];

export function QuestionEditor({
  question,
  questionNumber,
  onUpdate,
  onDelete,
  onReveal,
  onToggleVisibility
}: QuestionEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [textInput, setTextInput] = useState(question.question_text);
  const [options, setOptions] = useState<AnswerOption[]>(question.answer_options || []);
  const [newOptionText, setNewOptionText] = useState('');

  // Sync options when question changes
  useEffect(() => {
    setOptions(question.answer_options || []);
  }, [question.answer_options]);

  // Sync text input when question changes
  useEffect(() => {
    setTextInput(question.question_text);
  }, [question.question_text]);

  const handleTextSave = () => {
    if (textInput.trim()) {
      onUpdate({ question_text: textInput.trim() });
    }
    setEditingText(false);
  };

  const handleChartTypeChange = (chartType: ChartType) => {
    onUpdate({ chart_type: chartType });
  };

  const handleAddOption = async () => {
    if (!newOptionText.trim()) return;

    const newOrder = options.length;

    // Save to database
    const { data, error } = await supabase
      .from('answer_options')
      .insert({
        question_id: question.id,
        option_text: newOptionText.trim(),
        option_order: newOrder
      })
      .select()
      .single();

    if (data && !error) {
      setOptions([...options, data]);
      setNewOptionText('');
    }
  };

  const handleRemoveOption = async (optionId: string) => {
    // Delete from database
    const { error } = await supabase
      .from('answer_options')
      .delete()
      .eq('id', optionId);

    if (!error) {
      setOptions(options.filter(o => o.id !== optionId));
    }
  };

  const handleUpdateOption = async (optionId: string, newText: string) => {
    // Update local state immediately for responsiveness
    setOptions(options.map(o =>
      o.id === optionId ? { ...o, option_text: newText } : o
    ));
  };

  const handleOptionBlur = async (optionId: string, text: string) => {
    // Save to database when input loses focus
    await supabase
      .from('answer_options')
      .update({ option_text: text })
      .eq('id', optionId);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center gap-4">
        {/* Expand button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-navy text-white flex items-center justify-center text-sm font-semibold hover:bg-navy-light transition-colors"
          title={isExpanded ? 'Collapse' : 'Expand to edit options'}
        >
          {questionNumber}
        </button>

        {/* Question text */}
        <div className="flex-1 min-w-0">
          {editingText ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                className="flex-1 px-3 py-1 border border-gray-300 rounded"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTextSave();
                  if (e.key === 'Escape') {
                    setTextInput(question.question_text);
                    setEditingText(false);
                  }
                }}
                onBlur={handleTextSave}
              />
            </div>
          ) : (
            <h3
              className="font-medium text-gray-900 truncate hover:text-navy cursor-pointer"
              onClick={() => setEditingText(true)}
              title="Click to edit question text"
            >
              {question.question_text}
            </h3>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleVisibility(!question.is_visible)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              question.is_visible
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title={question.is_visible ? 'Click to hide from users' : 'Click to show to users'}
          >
            {question.is_visible ? '👁 Visible' : '👁‍🗨 Hidden'}
          </button>

          <button
            onClick={() => onReveal(!question.is_revealed)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              question.is_revealed
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title={question.is_revealed ? 'Results are shown' : 'Click to reveal results'}
          >
            {question.is_revealed ? '✓ Revealed' : 'Reveal'}
          </button>

          <button
            onClick={onDelete}
            className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Delete question"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand to edit options'}
          >
            <svg
              className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-4">
          {/* Chart Type */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-600 mb-2">Chart Type</label>
            <div className="flex flex-wrap gap-2">
              {CHART_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleChartTypeChange(value)}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    question.chart_type === value
                      ? 'bg-navy text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Answer Options */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Answer Options</label>
            <div className="space-y-2">
              {options
                .sort((a, b) => a.option_order - b.option_order)
                .map((option, index) => (
                  <div key={option.id} className="flex items-center gap-2">
                    <span className="w-6 text-sm text-gray-400">{index + 1}.</span>
                    <input
                      type="text"
                      value={option.option_text}
                      onChange={(e) => handleUpdateOption(option.id, e.target.value)}
                      onBlur={(e) => handleOptionBlur(option.id, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
                    />
                    <button
                      onClick={() => handleRemoveOption(option.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Remove option"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}

              {/* Add new option */}
              <div className="flex items-center gap-2 mt-3">
                <span className="w-6 text-sm text-gray-400">+</span>
                <input
                  type="text"
                  value={newOptionText}
                  onChange={(e) => setNewOptionText(e.target.value)}
                  placeholder="Add new option..."
                  className="flex-1 px-3 py-2 border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddOption();
                    }
                  }}
                />
                <button
                  onClick={handleAddOption}
                  disabled={!newOptionText.trim()}
                  className="px-3 py-2 bg-columbia-blue text-navy rounded-lg hover:bg-columbia-blue-dark transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
