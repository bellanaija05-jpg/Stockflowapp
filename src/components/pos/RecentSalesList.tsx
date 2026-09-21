import React from 'react';
import { Sale } from '../../types';
import { formatNaira } from '../../utils/currency';
import { Receipt, Clock, CreditCard, Banknote, ArrowRightLeft, ArrowUpRight } from 'lucide-react';

interface RecentSalesListProps {
  sales: Sale[];
  onViewReceipt: (sale: Sale) => void;
  branchName: string;
}

export const RecentSalesList: React.FC<RecentSalesListProps> = ({
  sales,
  onViewReceipt,
  branchName,
}) => {
  const paymentBadge = (method: string) => {
    switch (method) {
      case 'CASH':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/30">
            <Banknote className="w-2.5 h-2.5" />
            CASH
          </span>
        );
      case 'TRANSFER':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-800/30">
            <ArrowRightLeft className="w-2.5 h-2.5" />
            TRANSFER
          </span>
        );
      case 'POS':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-400 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-800/30">
            <CreditCard className="w-2.5 h-2.5" />
            POS
          </span>
        );
    }
  };

  return (
    <div
      id="recent-sales-card"
      className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg"
    >
      <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Recent Branch Transactions
          </h3>
        </div>
        <span className="text-[11px] text-slate-500 font-mono">
          {branchName}
        </span>
      </div>

      <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto">
        {sales.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No sales processed at this store yet today.
          </div>
        ) : (
          sales.map((sale) => {
            const timeStr = new Date(sale.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);

            return (
              <div
                key={sale.id}
                id={`recent-sale-row-${sale.id}`}
                className="px-5 py-3 flex items-center justify-between hover:bg-slate-800/40 transition-colors text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white">
                      {sale.transactionNumber}
                    </span>
                    {paymentBadge(sale.paymentMethod)}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span>{timeStr}</span>
                    <span>•</span>
                    <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                    <span>•</span>
                    <span className="text-slate-500">{sale.attendantName}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-mono font-bold text-emerald-400">
                      {formatNaira(sale.total)}
                    </div>
                  </div>

                  <button
                    id={`view-receipt-btn-${sale.id}`}
                    onClick={() => onViewReceipt(sale)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-[11px] border border-slate-700"
                    title="View & Print Receipt"
                  >
                    <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline">Receipt</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
