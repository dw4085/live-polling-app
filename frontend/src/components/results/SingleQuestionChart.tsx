import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import type { Question, ResponseCount } from '../../types';

interface SingleQuestionChartProps {
  question: Question;
  results: ResponseCount[];
  presentationMode?: boolean;
}

const COLORS = ['#E8702A', '#0EA7B5', '#FFBE4F', '#9B5DE5', '#00F5D4', '#FE6D73'];

// Custom tooltip component
function CustomTooltip({ active, payload, totalResponses }: any) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const count = data.count;
  const percentage = totalResponses > 0 ? ((count / totalResponses) * 100).toFixed(1) : 0;

  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3">
      <p className="font-medium text-gray-900 mb-1">{data.fullName || data.name}</p>
      <p className="text-gray-600">
        Count: <span className="font-semibold">{count}</span>
      </p>
      <p className="text-gray-600">
        Percentage: <span className="font-semibold">{percentage}%</span>
      </p>
    </div>
  );
}

export function SingleQuestionChart({
  question,
  results,
  presentationMode = false
}: SingleQuestionChartProps) {
  const chartData = useMemo(() => {
    return results
      .sort((a, b) => a.option_order - b.option_order)
      .map((r, index) => ({
        name: r.option_text.length > 20 ? r.option_text.substring(0, 20) + '...' : r.option_text,
        fullName: r.option_text,
        count: r.response_count,
        color: r.color || COLORS[index % COLORS.length]
      }));
  }, [results]);

  const totalResponses = useMemo(() => {
    return results.reduce((sum, r) => sum + r.response_count, 0);
  }, [results]);

  const isEmpty = totalResponses === 0;

  const chartHeight = presentationMode ? 400 : 300;
  const fontSize = presentationMode ? 16 : 12;

  const renderChart = () => {
    if (isEmpty) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-400">
          No responses yet
        </div>
      );
    }

    switch (question.chart_type) {
      case 'horizontal_bar':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
              <XAxis type="number" tick={{ fontSize }} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize }}
              />
              <Tooltip content={<CustomTooltip totalResponses={totalResponses} />} />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                animationDuration={500}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'vertical_bar':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} margin={{ bottom: 50 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize }}
                height={80}
              />
              <YAxis tick={{ fontSize }} />
              <Tooltip content={<CustomTooltip totalResponses={totalResponses} />} />
              <Bar
                dataKey="count"
                radius={[4, 4, 0, 0]}
                animationDuration={500}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
      case 'donut':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={question.chart_type === 'donut' ? '50%' : 0}
                outerRadius="80%"
                animationDuration={500}
                label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                labelLine={false}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip totalResponses={totalResponses} />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-fade-in">
      <h3 className={`font-semibold text-gray-900 mb-4 ${presentationMode ? 'text-2xl' : 'text-lg'}`}>
        {question.question_text}
      </h3>
      <div className="text-sm text-gray-500 mb-4">
        {totalResponses} response{totalResponses !== 1 ? 's' : ''}
      </div>
      {renderChart()}
    </div>
  );
}
