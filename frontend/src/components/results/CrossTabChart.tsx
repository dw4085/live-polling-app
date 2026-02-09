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
  [key: string]: string | number;
}

interface CombinationData {
  name: string;
  fullName: string;
  count: number;
  color: string;
}

// Custom tooltip for grouped bar chart
function GroupedTooltip({ active, payload, label, totalRespondents }: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3">
      <p className="font-medium text-gray-900 mb-2">{label}</p>
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
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3">
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
  const { groupedData, combinationData, totalRespondents } = useMemo(() => {
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

    // Format for grouped bar chart
    const groupedData: CrossTabData[] = q1Options
      .sort((a, b) => a.option_order - b.option_order)
      .map(o1 => {
        const row: CrossTabData = {
          name: o1.option_text.length > 15 ? o1.option_text.substring(0, 15) + '...' : o1.option_text
        };
        q2Options.forEach((o2) => {
          row[o2.option_text] = matrix[o1.id][o2.id];
        });
        return row;
      });

    // Format for combination bar chart
    const combinationData: CombinationData[] = [];
    let colorIndex = 0;
    q1Options
      .sort((a, b) => a.option_order - b.option_order)
      .forEach(o1 => {
        q2Options
          .sort((a, b) => a.option_order - b.option_order)
          .forEach(o2 => {
            const count = matrix[o1.id][o2.id];
            const q1Short = o1.option_text.length > 10 ? o1.option_text.substring(0, 10) + '...' : o1.option_text;
            const q2Short = o2.option_text.length > 10 ? o2.option_text.substring(0, 10) + '...' : o2.option_text;
            combinationData.push({
              name: `${q1Short} + ${q2Short}`,
              fullName: `${o1.option_text} + ${o2.option_text}`,
              count: count,
              color: COLORS[colorIndex % COLORS.length]
            });
            colorIndex++;
          });
      });

    // Sort combination data by count descending
    combinationData.sort((a, b) => b.count - a.count);

    return { groupedData, combinationData, totalRespondents };
  }, [responses, question1, question2]);

  const chartHeight = presentationMode ? 400 : 300;
  const fontSize = presentationMode ? 14 : 12;

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
            {question1.question_text.substring(0, 40)}... × {question2.question_text.substring(0, 40)}...
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
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={groupedData} margin={{ bottom: 50 }}>
            <XAxis
              dataKey="name"
              tick={{ fontSize }}
              height={80}
            />
            <YAxis tick={{ fontSize }} />
            <Tooltip content={<GroupedTooltip totalRespondents={totalRespondents} />} />
            <Legend />
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
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={combinationData} layout="vertical" margin={{ left: 120, right: 30 }}>
            <XAxis type="number" tick={{ fontSize }} />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ fontSize: fontSize - 2 }}
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
