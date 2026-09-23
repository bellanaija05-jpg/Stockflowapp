import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { storage } from '../db/storageEngine';
import { SupabaseBridge } from '../db/supabaseBridge';
import { Product, StoreInventory, StockTransfer } from '../types';
import { AccessDenied } from '../components/common/AccessDenied';
import {
  ArrowLeftRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Package,
} from 'lucide-react';

interface TransfersPageProps {
  onNavigateHome: () => void;
}

/**
 * Milestone 6 — Inter-Store Stock Transfers (V1, immediate execution).
 *
 * Connected mode: reads `stock_transfers` and executes everything through the
 * `public.execute_stock_transfer` RPC. This page NEVER inserts transfers,
 * inventory or movement rows and NEVER writes an audit row itself — the RPC
 * writes the single STOCK_TRANSFERRED audit row atomically with the transfer.
 *
 * Offline demo mode: transfers flow through the bridge into the existing
 * StorageEngine implementation (untouched).
 */
export const TransfersPage: React.FC<TransfersPageProps> = ({ onNavigateHome }) => {
  const { isAdmin, stores, users, currentUser } = useAuth();

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<StoreInventory[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create-transfer form
  const [productId, setProductId] = useState('');
  const [sourceStoreId, setSourceStoreId] = useState('');
  const [destinationStoreId, setDestinationStoreId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Milestone 6: synchronous double-submit guard — React state alone updates
  // too late to stop a second click in the same tick (two RPCs = two transfers).
  const submittingRef = useRef(false);

  const loadData = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      if (SupabaseBridge.isConnected()) {
        const [prodRes, invRes, trfRes] = await Promise.all([
          SupabaseBridge.fetchProducts(),
          SupabaseBridge.fetchInventory(),
          SupabaseBridge.fetchTransfers(),
        ]);
        if (!prodRes.success) throw new Error(prodRes.error);
        if (!invRes.success) throw new Error(invRes.error);
        if (!trfRes.success) throw new Error(trfRes.error);

        setProducts(prodRes.products || []);
        setInventory(invRes.inventory || []);
        setTransfers(trfRes.transfers || []);
      } else {
        // Offline demo mode — localStorage reads, mirrors POSPage/SalesPage.
        // Transfers still travel through the bridge (StorageEngine passthrough).
        setProducts(storage.getProducts().filter((p) => p.status === 'ACTIVE'));
        setInventory(storage.getInventory());
        const trfRes = await SupabaseBridge.fetchTransfers();
        if (!trfRes.success) throw new Error(trfRes.error);
        setTransfers(trfRes.transfers || []);
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load stock transfers.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sensible form defaults once products/stores arrive.
  useEffect(() => {
    if (!productId && products.length > 0) setProductId(products[0].id);
    if (!sourceStoreId && stores.length > 0) setSourceStoreId(stores[0].id);
    if (!destinationStoreId && stores.length > 1) setDestinationStoreId(stores[1].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, stores]);

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name || id;
  const productName = (id: string) => products.find((p) => p.id === id)?.name || id;
  const availableAt = (pid: string, sid: string) =>
    inventory.find((i) => i.productId === pid && i.storeId === sid)?.quantity ?? 0;
  // Actor display: created_by (UUID) → context users (public.profiles).
  // Offline rows store a name directly; the final fallback keeps the column
  // truthful when that user no longer exists.
  const actorName = (t: StockTransfer) =>
    users.find((u) => u.id === t.initiatedByUserId)?.name ||
    t.initiatedByUserName ||
    'Unknown staff member';

  const qtyNum = Number(quantity);
  const sourceAvailable = productId && sourceStoreId ? availableAt(productId, sourceStoreId) : 0;
  const insufficient = Number.isInteger(qtyNum) && qtyNum > 0 && sourceAvailable < qtyNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    // Synchronous double-submit guard (state alone is too late).
    if (submittingRef.current) return;

    if (!productId) {
      setSubmitError('Please select a product.');
      return;
    }
    if (!sourceStoreId || !destinationStoreId) {
      setSubmitError('Please select both source and destination stores.');
      return;
    }
    if (sourceStoreId === destinationStoreId) {
      setSubmitError('Source and destination store cannot be the same.');
      return;
    }
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      setSubmitError('Transfer quantity must be greater than 0.');
      return;
    }
    if (sourceAvailable < qtyNum) {
      setSubmitError(
        `Insufficient stock at source store. Available: ${sourceAvailable}, Requested: ${qtyNum}.`
      );
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const result = await SupabaseBridge.executeTransfer({
        productId,
        sourceStoreId,
        destinationStoreId,
        quantity: qtyNum,
        // Offline StorageEngine only — the connected RPC never receives an
        // actor identity (it derives auth.uid() server-side).
        userId: currentUser?.id || 'admin',
        userName: currentUser?.name || 'Staff',
        notes: notes.trim() ? notes.trim() : undefined,
      });

      if (!result.success) {
        // Truthful failure: no refresh, no success message, no audit row —
        // the RPC rolled everything back (or is not applied yet).
        setSubmitError(result.error || 'The stock transfer failed. No inventory was changed.');
        return;
      }

      setSuccessMessage(
        result.transfer
          ? `Transfer ${result.transfer.transferNumber} completed. Stock moved from ` +
              `${storeName(sourceStoreId)} to ${storeName(destinationStoreId)}.`
          : `Transfer completed. Stock moved from ${storeName(sourceStoreId)} to ${storeName(destinationStoreId)}.`
      );
      setNotes('');
      // Refresh ONLY after a successful RPC.
      await loadData();
    } catch (err: any) {
      setSubmitError(err?.message || 'The stock transfer failed. No inventory was changed.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!isAdmin) {
    return <AccessDenied requiredRole="Super Admin" onGoBack={onNavigateHome} />;
  }

  if (isLoading) {
    return (
      <div className="p-12 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading stock transfers...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-8 max-w-2xl mx-auto my-12 bg-slate-900 border border-rose-800/50 rounded-2xl text-center space-y-4 shadow-2xl">
        <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
        <h2 className="text-xl font-black text-white">Could not load stock transfers</h2>
        <p className="text-xs text-slate-400">{loadError}</p>
        <div className="pt-2">
          <button
            onClick={loadData}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-lg shadow-indigo-900/30"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Inter-Store Stock Transfers</h2>
          <p className="text-xs text-slate-400">
            Move stock between branches. Transfers execute atomically and complete immediately as
            COMPLETED.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
          <ArrowLeftRight className="w-4 h-4 text-emerald-400" />
          <span>Admin Only · Immediate Execution</span>
        </div>
      </div>

      {/* Feedback banners */}
      {submitError && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{submitError}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{successMessage}</span>
        </div>
      )}

      {/* Create transfer form */}
      <form
        onSubmit={handleSubmit}
        className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Create Transfer</h3>
          <span className="text-[10px] text-slate-500">
            Validated again by the database before anything changes
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Product *</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500"
            >
              <option value="">Select a product...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Quantity *</label>
            <input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Source Store *</label>
            <select
              value={sourceStoreId}
              onChange={(e) => setSourceStoreId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500"
            >
              <option value="">Select source...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.location})
                </option>
              ))}
            </select>
            {productId && sourceStoreId && (
              <p
                className={`text-[11px] mt-1.5 font-semibold ${
                  insufficient ? 'text-rose-400' : 'text-slate-400'
                }`}
              >
                Available here: {sourceAvailable} unit{sourceAvailable === 1 ? '' : 's'}
                {insufficient ? ` — need ${qtyNum}` : ''}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Destination Store *
            </label>
            <select
              value={destinationStoreId}
              onChange={(e) => setDestinationStoreId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500"
            >
              <option value="">Select destination...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.location})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Reason for the transfer (recorded on the ledger and audit trail)"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Transferring...
              </>
            ) : (
              'Execute Transfer'
            )}
          </button>
        </div>
      </form>

      {/* Transfer list */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-md">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white">Transfer History</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Newest first · one audit entry per completed transfer
          </p>
        </div>

        {transfers.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Package className="w-7 h-7 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">No stock transfers yet.</p>
            <p className="text-xs text-slate-500">
              Transfers you execute appear here with their transfer number, route and initiator.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="px-5 py-3 font-semibold">Transfer #</th>
                  <th className="px-5 py-3 font-semibold">Product</th>
                  <th className="px-5 py-3 font-semibold">Route</th>
                  <th className="px-5 py-3 font-semibold">Qty</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Initiated By</th>
                  <th className="px-5 py-3 font-semibold">Notes</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {transfers.map((t) => (
                  <tr key={t.id} className="text-slate-300 hover:bg-slate-800/40">
                    <td className="px-5 py-3 font-mono text-[11px] text-emerald-300 whitespace-nowrap">
                      {t.transferNumber}
                    </td>
                    <td className="px-5 py-3">{productName(t.productId)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {storeName(t.sourceStoreId)}{' '}
                      <span className="text-emerald-400 font-bold">→</span>{' '}
                      {storeName(t.destinationStoreId)}
                    </td>
                    <td className="px-5 py-3 font-mono">{t.quantity}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                          t.status === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3" title={t.initiatedByUserId}>
                      {actorName(t)}
                    </td>
                    <td
                      className="px-5 py-3 max-w-[180px] truncate text-slate-400"
                      title={t.notes || ''}
                    >
                      {t.notes || '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
