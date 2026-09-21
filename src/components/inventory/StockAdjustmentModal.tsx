import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Product, Store } from '../../types';
import { storage } from '../../db/storageEngine';
import {
  Boxes,
  X,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  FileText,
  Building2,
  Package,
} from 'lucide-react';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialProductId?: string;
  initialStoreId?: string;
}

const PREDEFINED_REASONS = [
  'New Delivery / Supplier Restock',
  'Physical Count Reconciliation / Audit',
  'Damaged / Defective Stock Written Off',
  'Customer Return to Inventory',
  'Store Discrepancy / Loss',
  'Internal Store Demo / Display Unit',
  'Warranty Exchange Replacement',
  'Other Reason',
];

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialProductId,
  initialStoreId,
}) => {
  const { currentUser, currentStore, isAdmin, stores } = useAuth();
  const products = storage.getProducts();

  const [selectedProductId, setSelectedProductId] = useState<string>(
    initialProductId || products[0]?.id || ''
  );
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    initialStoreId || (isAdmin ? stores[0]?.id || 'store-1' : currentStore?.id || 'store-1')
  );
  const [movementType, setMovementType] = useState<'STOCK_IN' | 'ADJUSTMENT'>('ADJUSTMENT');
  const [adjustmentMode, setAdjustmentMode] = useState<'SET_TOTAL' | 'ADD_QUANTITY'>('SET_TOTAL');
  const [inputValue, setInputValue] = useState<number>(0);
  const [reasonCategory, setReasonCategory] = useState<string>(PREDEFINED_REASONS[0]);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync initial props
  useEffect(() => {
    if (initialProductId) {
      setSelectedProductId(initialProductId);
    }
  }, [initialProductId]);

  useEffect(() => {
    if (initialStoreId) {
      setSelectedStoreId(initialStoreId);
    } else if (!isAdmin && currentStore) {
      setSelectedStoreId(currentStore.id);
    }
  }, [initialStoreId, isAdmin, currentStore]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  // Current stock level in this store
  const currentQuantity =
    selectedProductId && selectedStoreId
      ? storage.getStock(selectedProductId, selectedStoreId)
      : 0;

  // Initialize input value when product or store changes
  useEffect(() => {
    if (adjustmentMode === 'SET_TOTAL') {
      setInputValue(currentQuantity);
    } else {
      setInputValue(10);
    }
  }, [selectedProductId, selectedStoreId, adjustmentMode, currentQuantity]);

  if (!isOpen) return null;

  const targetQuantity =
    adjustmentMode === 'SET_TOTAL' ? inputValue : currentQuantity + inputValue;
  const quantityDiff = targetQuantity - currentQuantity;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedProductId) {
      setError('Please select a product.');
      return;
    }
    if (!selectedStoreId) {
      setError('Please select a retail branch.');
      return;
    }
    if (targetQuantity < 0) {
      setError('Final stock quantity cannot be negative.');
      return;
    }

    setIsSubmitting(true);

    const fullReasonNote = `${reasonCategory}${customNotes.trim() ? `: ${customNotes.trim()}` : ''}`;

    const result = storage.adjustStock({
      productId: selectedProductId,
      storeId: selectedStoreId,
      newQuantity: targetQuantity,
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'Staff',
      userRole: currentUser?.role || 'ADMIN',
      movementType: quantityDiff > 0 && movementType === 'STOCK_IN' ? 'STOCK_IN' : 'ADJUSTMENT',
      notes: fullReasonNote,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || 'Failed to adjust stock.');
      return;
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Stock Adjustment &amp; Restock</h3>
              <p className="text-xs text-slate-400">Atomic inventory update with mandatory audit log</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Product Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-emerald-400" />
              <span>Product Item</span>
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-hidden focus:border-emerald-500 transition-colors"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-800 text-white">
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>

          {/* Store Branch Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Retail Branch Location</span>
            </label>
            {isAdmin ? (
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-hidden focus:border-indigo-500 transition-colors"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-800 text-white">
                    {s.name} - {s.location.split(',')[0]}
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-3 py-2.5 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs text-emerald-300 font-semibold flex items-center justify-between">
                <span>{selectedStore?.name || 'Assigned Store'}</span>
                <span className="text-[10px] text-slate-400 font-normal">Assigned Branch (Locked)</span>
              </div>
            )}
          </div>

          {/* Current Stock vs Adjustment Mode */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Current In-Store Stock:</span>
              <span className="text-sm font-bold text-white font-mono">
                {currentQuantity} unit{currentQuantity === 1 ? '' : 's'}
              </span>
            </div>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAdjustmentMode('SET_TOTAL')}
                className={`py-1.5 text-center font-medium rounded-md transition-all ${
                  adjustmentMode === 'SET_TOTAL'
                    ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Set New Total
              </button>
              <button
                type="button"
                onClick={() => setAdjustmentMode('ADD_QUANTITY')}
                className={`py-1.5 text-center font-medium rounded-md transition-all ${
                  adjustmentMode === 'ADD_QUANTITY'
                    ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Add Units (+)
              </button>
            </div>

            {/* Input Field */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                {adjustmentMode === 'SET_TOTAL' ? 'Exact New Total Count' : 'Units to Add to Stock'}
              </label>
              <input
                type="number"
                min={adjustmentMode === 'SET_TOTAL' ? 0 : 1}
                value={inputValue}
                onChange={(e) => setInputValue(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Quantity Impact Preview */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Calculated Final Stock:</span>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-500 line-through">{currentQuantity}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-bold text-emerald-400 text-sm">{targetQuantity} units</span>
                {quantityDiff !== 0 && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.2 rounded-sm ${
                      quantityDiff > 0
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {quantityDiff > 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {quantityDiff > 0 ? `+${quantityDiff}` : quantityDiff}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Audit Reason Category */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Audit Reason Category *</span>
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-hidden focus:border-emerald-500"
            >
              {PREDEFINED_REASONS.map((reason) => (
                <option key={reason} value={reason} className="bg-slate-800 text-white">
                  {reason}
                </option>
              ))}
            </select>
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Reference / Delivery Note (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Waybill #WB-84920 from Ikeja Central Warehouse"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Submit Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all cursor-pointer flex items-center gap-2"
            >
              <Boxes className="w-4 h-4" />
              <span>Confirm Stock Adjustment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
