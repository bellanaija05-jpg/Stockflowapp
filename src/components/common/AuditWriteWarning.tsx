import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface AuditWriteWarningProps {
  /** Raw error reason (audit-write or save failure), or null when there is nothing to report. */
  reason: string | null;
  onDismiss: () => void;
  /** Heading; defaults to the Milestone 5D-B audit wording. */
  title?: string;
  /** Lead-in sentence rendered before the reason. */
  body?: string;
}

/**
 * Milestone 5D-B / 5D-C: non-blocking notice for a write that did not fully succeed —
 * either the database change saved but its audit-trail entry failed, or the save
 * itself was rejected. Failures are never silently swallowed and never fall back
 * to localStorage while connected.
 */
export const AuditWriteWarning: React.FC<AuditWriteWarningProps> = ({
  reason,
  onDismiss,
  title = 'Audit entry not recorded',
  body = 'The database change was saved, but the audit trail entry failed:',
}) => {
  if (!reason) return null;

  return (
    <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3.5 py-3">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 text-xs">
        <p className="font-semibold text-amber-300">{title}</p>
        <p className="text-amber-200/90 mt-0.5">
          {body} {reason}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss audit warning"
        className="text-amber-300/70 hover:text-amber-200 transition-colors cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
