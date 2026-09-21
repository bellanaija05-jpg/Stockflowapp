import React, { useState } from 'react';
import { DailyTrendPoint } from '../../types';
import { formatNaira } from '../../utils/currency';
import { TrendingUp, BarChart3, LineChart, Calendar, DollarSign, Activity } from 'lucide-react';

interface SalesTrendChartProps {
  data: DailyTrendPoint[];
  periodLabel: string;
}

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ data, periodLabel }) => {
  const [chartType, setChartType] = useState<'LINE' | 'BAR'>('LINE');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-center text-slate-400">
        No sales data available for the selected period.
      </div>
    );
  }

  // Calculate statistics
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const totalTransactions = data.reduce((sum, d) => sum + d.transactions, 0);
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const avgDailyRevenue = Math.round(totalRevenue / data.length);
  const peakDay = [...data].sort((a, b) => b.revenue - a.revenue)[0];

  // SVG Coordinates setup
  const width = 800;
  const height = 240;
  const paddingX = 40;
  const paddingBottom = 40;
  const paddingTop = 20;

  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;

  const points = data.map((d, index) => {
    const x =
      data.length === 1
        ? width / 2
        : paddingX + (index / (data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.revenue / maxRevenue) * chartHeight;
    return { x, y, ...d };
  });

  // Construct SVG Path
  const linePath =
    points.length === 1
      ? `M ${points[0].x - 40} ${points[0].y} L ${points[0].x + 40} ${points[0].y}`
      : points.reduce((acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), '');

  const areaPath =
    points.length === 1
      ? `${linePath} L ${points[0].x + 40} ${paddingTop + chartHeight} L ${points[0].x - 40} ${paddingTop + chartHeight} Z`
      : `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;

  // Grid lines
  const gridSteps = 4;
  const yTicks = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const val = (maxRevenue / gridSteps) * i;
    const y = paddingTop + chartHeight - (val / maxRevenue) * chartHeight;
    return { val, y };
  });

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Sales Revenue Trend
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
              {periodLabel}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Day-by-day completed transaction revenue with exact zero-value recording
          </p>
        </div>

        {/* View toggle & Peak Day badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setChartType('LINE')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                chartType === 'LINE'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LineChart className="w-3.5 h-3.5" />
              <span>Area</span>
            </button>
            <button
              onClick={() => setChartType('BAR')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                chartType === 'BAR'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Bar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mini Summary Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-800">
        <div>
          <div className="text-[11px] text-slate-400">Total Period Revenue</div>
          <div className="text-sm font-bold text-emerald-400">{formatNaira(totalRevenue)}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Daily Average</div>
          <div className="text-sm font-bold text-sky-400">{formatNaira(avgDailyRevenue)}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Peak Day Revenue</div>
          <div className="text-sm font-bold text-indigo-300">
            {formatNaira(peakDay?.revenue || 0)}
            <span className="text-[10px] text-slate-400 font-normal ml-1">
              ({peakDay?.displayDate || 'N/A'})
            </span>
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Completed Transactions</div>
          <div className="text-sm font-bold text-white">{totalTransactions} sales</div>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-56 select-none overflow-visible"
        >
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yTicks.map((tick, idx) => (
            <g key={idx}>
              <line
                x1={paddingX}
                y1={tick.y}
                x2={width - paddingX}
                y2={tick.y}
                stroke="#334155"
                strokeDasharray="4 4"
                strokeWidth="1"
                opacity={0.4}
              />
              <text
                x={paddingX - 8}
                y={tick.y + 3}
                fill="#64748b"
                fontSize="10"
                textAnchor="end"
                className="font-mono"
              >
                {tick.val >= 1000000
                  ? `₦${(tick.val / 1000000).toFixed(1)}M`
                  : tick.val >= 1000
                  ? `₦${(tick.val / 1000).toFixed(0)}k`
                  : `₦${tick.val.toFixed(0)}`}
              </text>
            </g>
          ))}

          {/* Area & Line */}
          {chartType === 'LINE' ? (
            <>
              <path d={areaPath} fill="url(#revenueGradient)" />
              <path
                d={linePath}
                fill="none"
                stroke="#6366f1"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {points.map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={hoveredIndex === i ? 5 : 3.5}
                  fill={pt.revenue > 0 ? '#818cf8' : '#475569'}
                  stroke="#1e1b4b"
                  strokeWidth="2"
                  className="transition-all duration-150 cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              ))}
            </>
          ) : (
            // Bar Chart View
            points.map((pt, i) => {
              const barWidth = Math.max(6, Math.min(24, chartWidth / points.length - 6));
              const barHeight = Math.max(2, paddingTop + chartHeight - pt.y);
              return (
                <rect
                  key={i}
                  x={pt.x - barWidth / 2}
                  y={pt.y}
                  width={barWidth}
                  height={barHeight}
                  rx="3"
                  fill={hoveredIndex === i ? '#818cf8' : pt.revenue > 0 ? '#4f46e5' : '#334155'}
                  className="transition-all duration-150 cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            })
          )}

          {/* X Axis Date Labels */}
          {points.map((pt, i) => {
            // Show every label if <= 10 items, or step every few items
            const step = Math.ceil(points.length / 10);
            if (i % step !== 0 && i !== points.length - 1) return null;
            return (
              <text
                key={i}
                x={pt.x}
                y={paddingTop + chartHeight + 20}
                fill="#94a3b8"
                fontSize="10"
                textAnchor="middle"
                className="font-medium"
              >
                {pt.displayDate}
              </text>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIndex !== null && points[hoveredIndex] && (
          <div
            className="absolute top-2 right-4 bg-slate-800 border border-slate-700 shadow-2xl p-3 rounded-xl pointer-events-none z-10 transition-all duration-150 animate-in fade-in"
          >
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span>{points[hoveredIndex].displayDate}</span>
              <span className="text-slate-600">•</span>
              <span className="font-mono text-slate-500">{points[hoveredIndex].date}</span>
            </div>
            <div className="text-base font-black text-white">
              {formatNaira(points[hoveredIndex].revenue)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {points[hoveredIndex].transactions} completed transaction{points[hoveredIndex].transactions === 1 ? '' : 's'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
