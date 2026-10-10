import React from 'react';
import { Columns, Check, Star } from 'lucide-react';
import { VisualComparisonData } from '../../services/visual/types';

interface ComparisonVisualProps {
  comparison: VisualComparisonData;
  topic: string;
}

export function ComparisonVisual({ comparison, topic }: ComparisonVisualProps) {
  const { title, description, headers, rows } = comparison;

  return (
    <div className="space-y-3 text-left">
      <div>
        <h4 className="font-semibold text-dark text-xs flex items-center gap-1.5">
          <Columns className="h-4 w-4 text-primary" />
          {title || `Comparative Analysis: ${topic}`}
        </h4>
        {description && (
          <p className="text-muted text-[11px] mt-0.5">{description}</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-border">
                {headers.map((header, idx) => (
                  <th
                    key={idx}
                    className={`p-3 font-semibold text-dark ${
                      idx === 0 ? 'w-1/3' : 'w-auto'
                    }`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={`transition-colors hover:bg-gray-50/70 ${
                    row.highlight ? 'bg-indigo-50/30' : ''
                  }`}
                >
                  <td className="p-3 font-medium text-dark/90 flex items-center gap-1.5">
                    {row.highlight && (
                      <Star className="h-3 w-3 text-amber-500 shrink-0 fill-amber-400" />
                    )}
                    {row.feature}
                  </td>
                  {row.values.map((val, valIdx) => (
                    <td key={valIdx} className="p-3 text-dark/80 leading-relaxed">
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
