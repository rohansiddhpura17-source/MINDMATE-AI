import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { VisualChartData } from '../../services/visual/types';
import { BarChart3, LineChart as LineChartIcon } from 'lucide-react';

interface ChartVisualProps {
  chart: VisualChartData;
  topic: string;
}

export function ChartVisual({ chart, topic }: ChartVisualProps) {
  const { chartType, title, description, data, xKey, series } = chart;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div>
          <h4 className="font-semibold text-dark flex items-center gap-1.5">
            {chartType === 'line' ? (
              <LineChartIcon className="h-4 w-4 text-primary" />
            ) : (
              <BarChart3 className="h-4 w-4 text-primary" />
            )}
            {title || `${topic} Quantitative Analysis`}
          </h4>
          {description && (
            <p className="text-muted text-[11px] mt-0.5">{description}</p>
          )}
        </div>
      </div>

      <div className="p-4 rounded-xl border border-border bg-white shadow-2xs">
        <div className="w-full h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
              <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                {series.map((s, idx) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name || s.key}
                    stroke={s.color || ['#6366f1', '#10b981', '#f59e0b', '#ef4444'][idx % 4]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                {series.map((s, idx) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.name || s.key}
                    fill={s.color || ['#6366f1', '#10b981', '#f59e0b'][idx % 3]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
