import React from 'react';
import { CategorySalesMetric } from '../../types';
import { formatNaira } from '../../utils/currency';
import { Layers, ArrowRight } from 'lucide-react';

interface CategorySalesTableProps {
  categories: CategorySalesMetric[];
  totalPeriodRevenue: number;
}

export const CategorySalesTable: React.FC<CategorySalesTableProps> = ({
  categories,
  totalPeriodRevenue,
}) => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/15 text-sky-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Sales by Category
            </h3>
            <p className="text-xs text-slate-400">
              Departmental performance across product categories
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-800/50 text-slate-400 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4 rounded-l-xl font-semibold">Category</th>
              <th className="py-3 px-4 font-semibold text-right">Units Sold</th>
              <th className="py-3 px-4 font-semibold text-right">Revenue</th>
              <th className="py-3 px-4 font-semibold text-right">Revenue Share</th>
              <th className="py-3 px-4 rounded-r-xl font-semibold text-right">Transactions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  No categorical sales recorded in this period.
                </td>
              </tr>
            ) : (
              categories.map((c) => {
                const share =
                  totalPeriodRevenue > 0
                    ? ((c.revenue / totalPeriodRevenue) * 100).toFixed(1)
                    : '0.0';
                return (
                  <tr key={c.categoryId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-bold text-white">
                      {c.categoryName}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-sky-400">
                      {c.unitsSold.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">
                      {formatNaira(c.revenue)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full rounded-full"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono w-10">
                          {share}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400 font-medium">
                      {c.transactions}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
