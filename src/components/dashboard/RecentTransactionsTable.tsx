import React from 'react';
import { Sale, Store } from '../../types';
import { formatNaira } from '../../utils/currency';
import { Receipt, Eye, ArrowRight, Building2, User } from 'lucide-react';

interface RecentTransactionsTableProps {
  sales: Sale[];
  stores: Store[];
  onViewReceipt: (sale: Sale) => void;
  onNavigateToSales: () => void;
}

export const RecentTransactionsTable: React.FC<RecentTransactionsTableProps> = ({
  sales,
  stores,
  onViewReceipt,
  onNavigateToSales,
}) => {
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  const formatDateTime = (isoDate: string) => {
    const d = new Date(isoDate);
    return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} • ${d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })}`;
  };

  const paymentBadge = (method: string) => {
    switch (method) {
      case 'POS':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'TRANSFER':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'CASH':
      default:
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-400">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Recent Completed Sales
            </h3>
            <p className="text-xs text-slate-400">
              Live transaction stream from authorized attendants across stores
            </p>
          </div>
        </div>

        <button
          onClick={onNavigateToSales}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer self-start sm:self-auto"
        >
          <span>All Sales Records</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-800/50 text-slate-400 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4 rounded-l-xl font-semibold">Transaction #</th>
              <th className="py-3 px-4 font-semibold">Store</th>
              <th className="py-3 px-4 font-semibold">Attendant</th>
              <th className="py-3 px-4 font-semibold text-center">Payment</th>
              <th className="py-3 px-4 font-semibold text-right">Total Amount</th>
              <th className="py-3 px-4 font-semibold text-right">Timestamp</th>
              <th className="py-3 px-4 rounded-r-xl font-semibold text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {sales.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No completed transactions recorded yet.
                </td>
              </tr>
            ) : (
              sales.map((s) => {
                const store = storeMap.get(s.storeId);
                return (
                  <tr
                    key={s.id}
                    onClick={() => onViewReceipt(s)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-indigo-400 group-hover:text-indigo-300">
                      {s.transactionNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-white font-medium">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>{store ? store.name : s.storeId}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span>{s.attendantName.split('(')[0]}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${paymentBadge(
                          s.paymentMethod
                        )}`}
                      >
                        {s.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-black text-emerald-400 text-sm">
                      {formatNaira(s.total)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                      {formatDateTime(s.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewReceipt(s);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-semibold border border-slate-700 transition-all cursor-pointer"
                      >
                        <Eye className="w-3 h-3 text-indigo-400" />
                        <span>Receipt</span>
                      </button>
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
