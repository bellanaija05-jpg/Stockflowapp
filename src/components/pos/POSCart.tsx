import React from 'react';
import { PaymentMethod, Product, StoreInventory } from '../../types';
import { formatNaira } from '../../utils/currency';
import {
  Trash2,
  Plus,
  Minus,
  AlertTriangle,
  CreditCard,
  Banknote,
  ArrowRightLeft,
  ShoppingBag,
  Check,
  AlertCircle,
  XCircle,
} from 'lucide-react';

export interface CartItem {
  product: Product;
  quantity: number;
  availableStock: number;
}

interface POSCartProps {
  items: CartItem[];
  paymentMethod: PaymentMethod;
  onSelectPaymentMethod: (method: PaymentMethod) => void;
  onUpdateQuantity: (productId: string, newQuantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  isProcessing: boolean;
  errorMessage?: string | null;
  discount: number;
  onUpdateDiscount?: (val: number) => void;
  notes: string;
  onUpdateNotes?: (notes: string) => void;
}

export const POSCart: React.FC<POSCartProps> = ({
  items,
  paymentMethod,
  onSelectPaymentMethod,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onCheckout,
  isProcessing,
  errorMessage,
  discount,
  notes,
  onUpdateNotes,
}) => {
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.sellingPrice * item.quantity,
    0
  );
  const total = Math.max(0, subtotal - discount);

  // Check if any cart item exceeds available branch stock
  const hasStockErrors = items.some(
    (item) => item.quantity > item.availableStock || item.availableStock <= 0
  );

  const canCheckout = items.length > 0 && !hasStockErrors && !isProcessing;

  return (
    <div
      id="pos-cart-container"
      className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">Current Sale Cart</h2>
            <div className="text-xs text-slate-400">
              {items.length} {items.length === 1 ? 'item' : 'items'} in order
            </div>
          </div>
        </div>

        {items.length > 0 && (
          <button
            id="clear-cart-btn"
            onClick={onClearCart}
            disabled={isProcessing}
            className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded hover:bg-rose-500/10 transition-colors"
          >
            Clear Cart
          </button>
        )}
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-800/60">
        {items.length === 0 ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-3 text-slate-600">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <p className="text-sm font-medium text-slate-400">Your cart is empty</p>
            <p className="text-xs text-slate-600 mt-1 max-w-[220px]">
              Scan a barcode, search by SKU, or click any product to add to cart.
            </p>
          </div>
        ) : (
          items.map((item, index) => {
            const isExceeding = item.quantity > item.availableStock;
            const isAtMax = item.quantity >= item.availableStock;
            const isOutOfStock = item.availableStock <= 0;

            return (
              <div
                key={item.product.id}
                id={`cart-item-${item.product.id}`}
                className={`pt-3 first:pt-0 ${
                  isExceeding ? 'bg-rose-950/20 p-2 rounded-xl border border-rose-800/40' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {item.product.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                      <span className="font-mono text-slate-500">{item.product.sku}</span>
                      <span>•</span>
                      <span className="text-slate-300 font-medium">
                        {formatNaira(item.product.sellingPrice)}
                      </span>
                    </div>

                    {/* Stock Status Badge */}
                    <div className="mt-1 flex items-center gap-1.5">
                      {isOutOfStock ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/30">
                          <XCircle className="w-3 h-3" />
                          Out of stock at this store
                        </span>
                      ) : isExceeding ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 bg-rose-950/50 px-2 py-0.5 rounded border border-rose-800/40">
                          <AlertCircle className="w-3 h-3" />
                          Only {item.availableStock} available!
                        </span>
                      ) : (
                        <span
                          className={`text-[11px] font-mono ${
                            isAtMax ? 'text-amber-400 font-semibold' : 'text-slate-500'
                          }`}
                        >
                          Branch stock: {item.availableStock}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Line Total */}
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-400 font-mono">
                      {formatNaira(item.product.sellingPrice * item.quantity)}
                    </div>
                    <button
                      id={`remove-cart-item-${item.product.id}`}
                      onClick={() => onRemoveItem(item.product.id)}
                      disabled={isProcessing}
                      className="mt-1 p-1 text-slate-500 hover:text-rose-400 transition-colors rounded hover:bg-slate-800"
                      title="Remove product"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="flex items-center bg-slate-950 rounded-xl border border-slate-800 p-0.5">
                    <button
                      id={`qty-decrease-${item.product.id}`}
                      onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                      disabled={isProcessing}
                      className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                      title="Decrease quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <input
                      id={`qty-input-${item.product.id}`}
                      type="number"
                      min="1"
                      max={item.availableStock}
                      value={item.quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          onUpdateQuantity(item.product.id, val);
                        }
                      }}
                      className="w-12 text-center text-xs font-bold text-white bg-transparent focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded py-0.5"
                    />

                    <button
                      id={`qty-increase-${item.product.id}`}
                      onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                      disabled={isProcessing || isAtMax}
                      className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                      title={isAtMax ? 'Maximum available stock reached' : 'Increase quantity'}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isAtMax && !isExceeding && (
                    <span className="text-[10px] text-amber-400 font-medium">Max stock added</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Checkout Control Panel */}
      {items.length > 0 && (
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3.5">
          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Payment Method *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="payment-method-cash"
                onClick={() => onSelectPaymentMethod('CASH')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all ${
                  paymentMethod === 'CASH'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Banknote className="w-4 h-4 mb-1" />
                <span>CASH</span>
                {paymentMethod === 'CASH' && (
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                )}
              </button>

              <button
                type="button"
                id="payment-method-transfer"
                onClick={() => onSelectPaymentMethod('TRANSFER')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all ${
                  paymentMethod === 'TRANSFER'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <ArrowRightLeft className="w-4 h-4 mb-1" />
                <span>TRANSFER</span>
                {paymentMethod === 'TRANSFER' && (
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                )}
              </button>

              <button
                type="button"
                id="payment-method-pos"
                onClick={() => onSelectPaymentMethod('POS')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all ${
                  paymentMethod === 'POS'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <CreditCard className="w-4 h-4 mb-1" />
                <span>POS CARD</span>
                {paymentMethod === 'POS' && (
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                )}
              </button>
            </div>
          </div>

          {/* Optional Notes */}
          {onUpdateNotes && (
            <div>
              <input
                id="pos-sale-notes"
                type="text"
                placeholder="Optional customer/sale note..."
                value={notes}
                onChange={(e) => onUpdateNotes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-700"
              />
            </div>
          )}

          {/* Financial Calculation */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/80 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal:</span>
              <span className="font-mono">{formatNaira(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount:</span>
                <span className="font-mono">-{formatNaira(discount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm pt-1 border-t border-slate-800">
              <span className="font-bold text-white">Grand Total:</span>
              <span className="text-lg font-black text-emerald-400 font-mono">
                {formatNaira(total)}
              </span>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-start gap-2 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Complete Sale Button */}
          <button
            id="complete-sale-btn"
            type="button"
            onClick={onCheckout}
            disabled={!canCheckout}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
              canCheckout
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-[0.99]'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Processing Sale...</span>
              </div>
            ) : hasStockErrors ? (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span>Adjust Stock to Checkout</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span>Complete Sale</span>
                <span className="font-mono text-emerald-200">({formatNaira(total)})</span>
              </div>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
