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

// Custom Y-axis tick for horizontal bar chart
function CustomYAxisTick({ x, y, payload, baseSize }: any) {
  const text = payload.value;
  const fontSize = getFontSize(text, baseSize);
  const lines = wrapText(text, 18);
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

// Custom X-axis tick for vertical bar chart
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

// Custom label for pie chart
function renderPieLabel({ cx, cy, midAngle, outerRadius, name, percent }: any) {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius * 1.2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  const fontSize = getFontSize(name, 12);
  const lines = wrapText(name, 15);
  const lineHeight = fontSize + 2;
  const percentText = `(${((percent || 0) * 100).toFixed(0)}%)`;

  return (
    <g>
      {lines.map((line, index) => (
        <text
          key={index}
          x={x}
          y={y + index * lineHeight}
          textAnchor={x > cx ? 'start' : 'end'}
          fontSize={fontSize}
          fill="#374151"
          dominantBaseline="middle"
        >
          {line}
        </text>
      ))}
      <text
        x={x}
        y={y + lines.length * lineHeight}
        textAnchor={x > cx ? 'start' : 'end'}
        fontSize={fontSize}
        fill="#6B7280"
        dominantBaseline="middle"
      >
        {percentText}
      </text>
    </g>
  );
}

// Custom tooltip component
function CustomTooltip({ active, payload, totalResponses }: any) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const count = data.count;
  const percentage = totalResponses > 0 ? ((count / totalResponses) * 100).toFixed(1) : 0;

  return (
    <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 max-w-xs">
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

// Custom legend formatter
function renderLegendText(value: string) {
  const fontSize = getFontSize(value, 12);
  return <span style={{ fontSize, color: '#374151' }}>{value}</span>;
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
        name: r.option_text,
        fullName: r.option_text,
        count: r.response_count,
        color: r.color || COLORS[index % COLORS.length]
      }));
  }, [results]);

  const totalResponses = useMemo(() => {
    return results.reduce((sum, r) => sum + r.response_count, 0);
  }, [results]);

  const isEmpty = totalResponses === 0;

  // Calculate dynamic height based on number of options and text length
  const maxLabelLength = Math.max(...chartData.map(d => d.name.length), 0);
  const numOptions = chartData.length;

  const baseHeight = presentationMode ? 400 : 300;
  const heightPerOption = maxLabelLength > 40 ? 80 : maxLabelLength > 20 ? 60 : 50;
  const chartHeight = question.chart_type === 'horizontal_bar'
    ? Math.max(baseHeight, numOptions * heightPerOption)
    : baseHeight;

  const baseFontSize = presentationMode ? 14 : 12;

  // Calculate Y-axis width based on max label length
  const yAxisWidth = Math.min(200, Math.max(100, maxLabelLength * 5));

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
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
              <XAxis type="number" tick={{ fontSize: baseFontSize }} />
              <YAxis
                type="category"
                dataKey="name"
                width={yAxisWidth}
                tick={<CustomYAxisTick baseSize={baseFontSize} />}
                interval={0}
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
          <ResponsiveContainer width="100%" height={chartHeight + (maxLabelLength > 20 ? 50 : 0)}>
            <BarChart data={chartData} margin={{ bottom: maxLabelLength > 30 ? 100 : 60, left: 10, right: 10 }}>
              <XAxis
                dataKey="name"
                tick={<CustomXAxisTick baseSize={baseFontSize} />}
                height={maxLabelLength > 30 ? 100 : 60}
                interval={0}
              />
              <YAxis tick={{ fontSize: baseFontSize }} />
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
          <ResponsiveContainer width="100%" height={chartHeight + 50}>
            <PieChart margin={{ top: 20, bottom: 20, left: 20, right: 20 }}>
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={question.chart_type === 'donut' ? '40%' : 0}
                outerRadius="60%"
                animationDuration={500}
                label={renderPieLabel}
                labelLine={true}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip totalResponses={totalResponses} />} />
              <Legend formatter={renderLegendText} />
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
