import { useEffect, useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell
} from 'recharts';
import { supabase } from '../../services/supabase';
import type { Question, Response } from '../../types';

interface CrossTabChartProps {
  question1: Question;
  question2: Question;
  pollId: string;
  presentationMode?: boolean;
}

const COLORS = ['#E8702A', '#0EA7B5', '#FFBE4F', '#9B5DE5', '#00F5D4', '#FE6D73'];

interface CrossTabData {
  name: string;
  fullName: string;
  [key: string]: string | number;
}

interface CombinationData {
  name: string;
  fullName: string;
  count: number;
  color: string;
}

// Calculate font size based on text length
function getFontSize(text: string, baseSize: number): number {
  const length = text.length;
  if (length <= 15) return baseSize;
  if (length <= 30) return Math.max(baseSize - 2, 10);
  if (length <= 50) return Math.max(baseSize - 4, 9);
  return Math.max(baseSize - 5, 8);
}

// Wrap text at word boundaries
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  words.forEach(word => {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

// Custom Y-axis tick for horizontal bar chart (combinations)
function CustomYAxisTick({ x, y, payload, baseSize }: any) {
  const text = payload.value;
  const fontSize = getFontSize(text, baseSize);
  const lines = wrapText(text, 25);
  const lineHeight = fontSize + 2;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;

  return (
    <g>
      {lines.map((line, index) => (
        <text
          key={index}
          x={x - 5}
          y={startY + index * lineHeight}
          textAnchor="end"
          fontSize={fontSize}
          fill="#374151"
          dominantBaseline="middle"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

// Custom X-axis tick for vertical/grouped bar chart
function CustomXAxisTick({ x, y, payload, baseSize }: any) {
  const text = payload.value;
  const fontSize = getFontSize(text, baseSize);
  const lines = wrapText(text, 12);
  const lineHeight = fontSize + 2;

  return (
    <g>
      {lines.map((line, index) => (
        <text
          key={index}
          x={x}
          y={y + 10 + index * lineHeight}
          textAnchor="middle"
          fontSize={fontSize}
          fill="#374151"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

// Custom legend formatter
function renderLegendText(value: string) {
  const fontSize = getFontSize(value, 12);
  return <span style={{ fontSize, color: '#374151' }}>{value}</span>;
}

// Custom tooltip for grouped bar chart
function GroupedTooltip({ active, payload, label, totalRespondents }: any) {
  if (!active || !payload || !payload.length) return null;

  // Find the full name from the first payload
  const fullLabel = payload[0]?.payload?.fullName || label;

  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 max-w-sm">
      <p className="font-medium text-gray-900 mb-2">{fullLabel}</p>
      {payload.map((entry: any, index: number) => {
        const count = entry.value;
        const percentage = totalRespondents > 0 ? ((count / totalRespondents) * 100).toFixed(1) : 0;
        return (
          <p key={index} className="text-gray-600" style={{ color: entry.color }}>
            {entry.name}: <span className="font-semibold">{count}</span> ({percentage}%)
          </p>
        );
      })}
    </div>
  );
}

// Custom tooltip for combination bar chart
function CombinationTooltip({ active, payload, totalRespondents }: any) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const count = data.count;
  const percentage = totalRespondents > 0 ? ((count / totalRespondents) * 100).toFixed(1) : 0;

  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 max-w-sm">
      <p className="font-medium text-gray-900 mb-1">{data.fullName}</p>
      <p className="text-gray-600">
        Count: <span className="font-semibold">{count}</span>
      </p>
      <p className="text-gray-600">
        Percentage: <span className="font-semibold">{percentage}%</span>
      </p>
    </div>
  );
}

export function CrossTabChart({
  question1,
  question2,
  presentationMode = false
}: CrossTabChartProps) {
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grouped' | 'combination'>('grouped');

  // Fetch all responses for cross-tabulation
  useEffect(() => {
    async function loadResponses() {
      const { data } = await supabase
        .from('responses')
        .select('*')
        .in('question_id', [question1.id, question2.id]);

      setResponses(data || []);
      setLoading(false);
    }

    loadResponses();
  }, [question1.id, question2.id]);

  // Build cross-tabulation matrix
  const { groupedData, combinationData, totalRespondents, maxLabelLength } = useMemo(() => {
    const q1Options = question1.answer_options || [];
    const q2Options = question2.answer_options || [];

    // Group responses by session
    const responsesBySession: Record<string, { q1?: string; q2?: string }> = {};
    responses.forEach(r => {
      if (!responsesBySession[r.session_id]) {
        responsesBySession[r.session_id] = {};
      }
      if (r.question_id === question1.id) {
        responsesBySession[r.session_id].q1 = r.answer_option_id;
      } else if (r.question_id === question2.id) {
        responsesBySession[r.session_id].q2 = r.answer_option_id;
      }
    });

    // Count respondents who answered both questions
    const totalRespondents = Object.values(responsesBySession).filter(
      ({ q1, q2 }) => q1 && q2
    ).length;

    // Build cross-tab matrix
    const matrix: Record<string, Record<string, number>> = {};
    q1Options.forEach(o1 => {
      matrix[o1.id] = {};
      q2Options.forEach(o2 => {
        matrix[o1.id][o2.id] = 0;
      });
    });

    // Count combinations
    Object.values(responsesBySession).forEach(({ q1, q2 }) => {
      if (q1 && q2 && matrix[q1] && matrix[q1][q2] !== undefined) {
        matrix[q1][q2]++;
      }
    });

    // Calculate max label length for sizing
    const allLabels = [...q1Options.map(o => o.option_text), ...q2Options.map(o => o.option_text)];
    const maxLabelLength = Math.max(...allLabels.map(l => l.length), 0);

    // Format for grouped bar chart (full labels)
    const groupedData: CrossTabData[] = q1Options
      .sort((a, b) => a.option_order - b.option_order)
      .map(o1 => {
        const row: CrossTabData = {
          name: o1.option_text,
          fullName: o1.option_text
        };
        q2Options.forEach((o2) => {
          row[o2.option_text] = matrix[o1.id][o2.id];
        });
        return row;
      });

    // Format for combination bar chart (full labels)
    const combinationData: CombinationData[] = [];
    let colorIndex = 0;
    q1Options
      .sort((a, b) => a.option_order - b.option_order)
      .forEach(o1 => {
        q2Options
          .sort((a, b) => a.option_order - b.option_order)
          .forEach(o2 => {
            const count = matrix[o1.id][o2.id];
            combinationData.push({
              name: `${o1.option_text} + ${o2.option_text}`,
              fullName: `${o1.option_text} + ${o2.option_text}`,
              count: count,
              color: COLORS[colorIndex % COLORS.length]
            });
            colorIndex++;
          });
      });

    // Sort combination data by count descending
    combinationData.sort((a, b) => b.count - a.count);

    return { groupedData, combinationData, totalRespondents, maxLabelLength };
  }, [responses, question1, question2]);

  const baseFontSize = presentationMode ? 14 : 12;

  // Dynamic chart height based on content
  const numCombinations = combinationData.length;
  const baseHeight = presentationMode ? 400 : 300;
  const combinationHeight = Math.max(baseHeight, numCombinations * (maxLabelLength > 30 ? 50 : 40));

  // Dynamic Y-axis width for combination chart
  const yAxisWidth = Math.min(250, Math.max(150, maxLabelLength * 4));

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="animate-pulse h-64 bg-gray-100 rounded"></div>
      </div>
    );
  }

  const q1Options = question1.answer_options || [];
  const q2Options = question2.answer_options || [];

  // Show message if no answer options
  if (q1Options.length === 0 || q2Options.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 text-lg mb-2">Cross-Tabulation</h3>
        <p className="text-gray-500">Questions need answer options to show cross-tabulation.</p>
      </div>
    );
  }

  // Show message if no responses yet
  if (responses.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 text-lg mb-2">Cross-Tabulation</h3>
        <p className="text-gray-500">No responses yet for cross-tabulation.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className={`font-semibold text-gray-900 ${presentationMode ? 'text-2xl' : 'text-lg'}`}>
            Cross-Tabulation
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {question1.question_text} × {question2.question_text}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {totalRespondents} respondent{totalRespondents !== 1 ? 's' : ''} answered both questions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              viewMode === 'grouped'
                ? 'bg-navy text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Grouped
          </button>
          <button
            onClick={() => setViewMode('combination')}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              viewMode === 'combination'
                ? 'bg-navy text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Combinations
          </button>
        </div>
      </div>

      {viewMode === 'grouped' ? (
        <ResponsiveContainer width="100%" height={baseHeight + (maxLabelLength > 20 ? 50 : 0)}>
          <BarChart data={groupedData} margin={{ bottom: maxLabelLength > 30 ? 100 : 60, left: 10, right: 10 }}>
            <XAxis
              dataKey="name"
              tick={<CustomXAxisTick baseSize={baseFontSize} />}
              height={maxLabelLength > 30 ? 100 : 60}
              interval={0}
            />
            <YAxis tick={{ fontSize: baseFontSize }} />
            <Tooltip content={<GroupedTooltip totalRespondents={totalRespondents} />} />
            <Legend formatter={renderLegendText} />
            {(question2.answer_options || [])
              .sort((a, b) => a.option_order - b.option_order)
              .map((option, index) => (
                <Bar
                  key={option.id}
                  dataKey={option.option_text}
                  fill={COLORS[index % COLORS.length]}
                  animationDuration={500}
                />
              ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={combinationHeight}>
          <BarChart data={combinationData} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
            <XAxis type="number" tick={{ fontSize: baseFontSize }} />
            <YAxis
              type="category"
              dataKey="name"
              width={yAxisWidth}
              tick={<CustomYAxisTick baseSize={baseFontSize - 1} />}
              interval={0}
            />
            <Tooltip content={<CombinationTooltip totalRespondents={totalRespondents} />} />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              animationDuration={500}
            >
              {combinationData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
