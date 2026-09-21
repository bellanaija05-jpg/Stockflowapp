import React from 'react';
import { LucideIcon, ArrowRight } from 'lucide-react';

interface PlaceholderModulePageProps {
  title: string;
  subtitle: string;
  milestone: string;
  description: string;
  icon: LucideIcon;
  features: string[];
  onActionClick?: () => void;
  actionText?: string;
}

export const PlaceholderModulePage: React.FC<PlaceholderModulePageProps> = ({
  title,
  subtitle,
  milestone,
  description,
  icon: Icon,
  features,
  onActionClick,
  actionText,
}) => {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
            <Icon className="w-8 h-8" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {milestone}
            </span>
            <h2 className="text-2xl font-bold text-white tracking-tight mt-2">{title}</h2>
            <p className="text-slate-400 text-xs mt-1">{subtitle}</p>
          </div>
        </div>

        <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-800 text-slate-300 text-xs leading-relaxed">
          {description}
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Architected Capabilities
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {features.map((feat, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-200 flex items-center gap-2.5"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {onActionClick && actionText && (
          <div className="pt-2">
            <button
              onClick={onActionClick}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
            >
              <span>{actionText}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
