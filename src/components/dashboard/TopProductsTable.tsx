import React, { useState, useMemo } from 'react';
import { TopSellingProductMetric } from '../../types';
import { formatNaira } from '../../utils/currency';
import { Package, ArrowUpDown, ChevronDown, Award, Search, Filter } from 'lucide-react';

interface TopProductsTableProps {
  products: TopSellingProductMetric[];
}

export const TopProductsTable: React.FC<TopProductsTableProps> = ({ products }) => {
  const [limit, setLimit] = useState<number>(10);
  const [sortBy, setSortBy] = useState<'unitsSold' | 'revenue'>('revenue');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  const sortedAndFiltered = useMemo(() => {
    let list = [...products];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const valA = a[sortBy];
      const valB = b[sortBy];
      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });

    return list.slice(0, limit);
  }, [products, limit, sortBy, sortOrder, searchTerm]);

  const toggleSort = (field: 'unitsSold' | 'revenue') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Top-Selling Products
            </h3>
            <p className="text-xs text-slate-400">
              Product sales volume and generated revenue ranking
            </p>
          </div>
        </div>

        {/* Controls: Search, Limit, Sort */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search product / SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 text-xs text-white pl-8 pr-3 py-1.5 rounded-xl placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44"
            />
          </div>

          <div className="flex items-center bg-slate-800/80 p-0.5 rounded-xl border border-slate-700 text-xs text-slate-300">
            <span className="px-2 text-slate-500 text-[11px]">Show:</span>
            {[5, 10, 20].map((num) => (
              <button
                key={num}
                onClick={() => setLimit(num)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  limit === num
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Top {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-800/50 text-slate-400 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4 rounded-l-xl font-semibold">#</th>
              <th className="py-3 px-4 font-semibold">Product Name</th>
              <th className="py-3 px-4 font-semibold">SKU</th>
              <th className="py-3 px-4 font-semibold">Category</th>
              <th
                onClick={() => toggleSort('unitsSold')}
                className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Units Sold</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th
                onClick={() => toggleSort('revenue')}
                className="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Revenue</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-4 rounded-r-xl font-semibold text-right">Transactions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {sortedAndFiltered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No products matched the sales query.
                </td>
              </tr>
            ) : (
              sortedAndFiltered.map((p, idx) => (
                <tr key={p.productId} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-4 font-semibold text-white">
                    {p.productName}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                    {p.sku}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[11px]">
                      {p.categoryName}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-sky-400">
                    {p.unitsSold.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-400">
                    {formatNaira(p.revenue)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400 font-medium">
                    {p.transactionsCount}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
