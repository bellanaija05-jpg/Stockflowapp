import React from 'react';
import { PaymentMethodMetric } from '../../types';
import { formatNaira } from '../../utils/currency';
import { CreditCard, Landmark, Banknote, PieChart } from 'lucide-react';

interface PaymentBreakdownCardProps {
  data: {
    CASH: PaymentMethodMetric;
    TRANSFER: PaymentMethodMetric;
    POS: PaymentMethodMetric;
  };
  totalRevenue: number;
}

export const PaymentBreakdownCard: React.FC<PaymentBreakdownCardProps> = ({ data, totalRevenue }) => {
  const methods = [
    {
      key: 'POS' as const,
      label: 'POS Terminal',
      icon: CreditCard,
      color: 'bg-emerald-500',
      textColor: 'text-emerald-400',
      badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      info: data.POS,
    },
    {
      key: 'TRANSFER' as const,
      label: 'Bank Transfer',
      icon: Landmark,
      color: 'bg-sky-500',
      textColor: 'text-sky-400',
      badgeBg: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
      info: data.TRANSFER,
    },
    {
      key: 'CASH' as const,
      label: 'Cash Tendered',
      icon: Banknote,
      color: 'bg-amber-500',
      textColor: 'text-amber-400',
      badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      info: data.CASH,
    },
  ];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400">
            <PieChart className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Sales by Payment Method
            </h3>
            <p className="text-xs text-slate-400">
              Completed transaction settlement breakdown
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Total Settlement</div>
          <div className="text-sm font-bold text-white">{formatNaira(totalRevenue)}</div>
        </div>
      </div>

      {/* Multi-segment stacked bar */}
      <div className="space-y-1.5">
        <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex">
          {methods.map((m) => (
            <div
              key={m.key}
              style={{ width: `${m.info.percentage}%` }}
              className={`h-full ${m.color} transition-all duration-500`}
              title={`${m.label}: ${m.info.percentage}% (${formatNaira(m.info.revenue)})`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-slate-500 px-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Individual Method Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {methods.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.key}
              className="p-4 rounded-xl bg-slate-800/40 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${m.badgeBg}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-white">{m.label}</span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${m.badgeBg}`}>
                  {m.info.percentage}%
                </span>
              </div>

              <div>
                <div className={`text-lg font-black tracking-tight ${m.textColor}`}>
                  {formatNaira(m.info.revenue)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {m.info.count} transaction{m.info.count === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
