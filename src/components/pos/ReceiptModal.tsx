import React from 'react';
import { Sale, Store } from '../../types';
import { formatNaira } from '../../utils/currency';
import {
  Printer,
  X,
  CheckCircle2,
  Store as StoreIcon,
  Calendar,
  Clock,
  User as UserIcon,
  CreditCard,
  PlusCircle,
  ShieldCheck,
} from 'lucide-react';

interface ReceiptModalProps {
  sale: Sale;
  store?: Store;
  onClose: () => void;
  onNewSale?: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  store,
  onClose,
  onNewSale,
}) => {
  const dateObj = new Date(sale.createdAt);
  const formattedDate = dateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = dateObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      id="receipt-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="receipt-modal-card"
        className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Top Success Banner */}
        <div className="bg-emerald-600/15 border-b border-emerald-500/20 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-emerald-300">
                Transaction Completed
              </div>
              <div className="text-xs text-slate-400">
                Receipt #{sale.transactionNumber}
              </div>
            </div>
          </div>
          <button
            id="receipt-close-btn-top"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Receipt Paper Container */}
        <div className="p-6 bg-slate-950 print:bg-white print:text-black">
          <div
            id="printable-receipt"
            className="bg-white text-slate-900 p-6 rounded-xl shadow-inner font-mono text-xs border border-slate-200"
          >
            {/* Store Branding Header */}
            <div className="text-center pb-4 border-b border-dashed border-slate-300">
              <div className="text-lg font-black tracking-tight text-slate-900 font-sans uppercase">
                StockFlow POS
              </div>
              <div className="text-[11px] font-medium text-slate-600 font-sans">
                {store?.name ?? `Store Branch (${sale.storeId})`}
              </div>
              {store?.location && (
                <div className="text-[10px] text-slate-500 max-w-xs mx-auto">
                  {store.location}
                </div>
              )}
              {store?.phone && (
                <div className="text-[10px] text-slate-500">
                  Tel: {store.phone}
                </div>
              )}
              <div className="inline-block mt-2 px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-sm uppercase tracking-wider">
                Official Customer Receipt
              </div>
            </div>

            {/* Metadata Rows */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">TRX NO:</span>
                <span className="font-bold text-slate-900">{sale.transactionNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">DATE:</span>
                <span>{formattedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">TIME:</span>
                <span>{formattedTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ATTENDANT:</span>
                <span className="font-semibold">{sale.attendantName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">PAYMENT:</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-xs">
                  {sale.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">STATUS:</span>
                <span className="font-bold text-slate-800">{sale.status}</span>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="py-3 border-b border-dashed border-slate-300">
              <div className="flex justify-between font-bold text-[10px] uppercase text-slate-500 pb-1.5 border-b border-slate-200">
                <span className="w-1/2">Item Description</span>
                <span className="w-1/6 text-center">Qty</span>
                <span className="w-1/6 text-right">Price</span>
                <span className="w-1/6 text-right">Total</span>
              </div>
              <div className="divide-y divide-slate-100 pt-1.5 space-y-2">
                {sale.items.map((item, idx) => (
                  <div key={item.id || idx} className="pt-1.5 first:pt-0">
                    <div className="font-semibold text-slate-900 leading-tight">
                      {item.productName}
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 mt-0.5">
                      <span className="w-1/2 font-mono text-slate-400">{item.sku}</span>
                      <span className="w-1/6 text-center font-bold text-slate-800">
                        {item.quantity}
                      </span>
                      <span className="w-1/6 text-right">
                        {formatNaira(item.unitPrice)}
                      </span>
                      <span className="w-1/6 text-right font-semibold text-slate-900">
                        {formatNaira(item.lineTotal)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>{formatNaira(sale.subtotal)}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount:</span>
                  <span>-{formatNaira(sale.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-slate-950 pt-1 border-t border-slate-300">
                <span>TOTAL AMOUNT:</span>
                <span className="text-emerald-700 font-sans">{formatNaira(sale.total)}</span>
              </div>
            </div>

            {/* Receipt Notes */}
            {sale.notes && (
              <div className="py-2 border-b border-dashed border-slate-300 text-[10px] text-slate-500">
                <span className="font-bold">Note:</span> {sale.notes}
              </div>
            )}

            {/* Receipt Footer */}
            <div className="pt-4 text-center text-[10px] text-slate-500 space-y-1">
              <div className="font-bold text-slate-700">Thank you for your patronage!</div>
              <div>Accessories inspected and tested before delivery.</div>
              <div>Retain this receipt for warranty service within 14 days.</div>
              <div className="pt-2 text-[9px] text-slate-400 font-mono tracking-widest">
                *** POWERED BY STOCKFLOW POS ***
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Controls */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            id="receipt-print-btn"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition-colors border border-slate-700"
          >
            <Printer className="w-4 h-4 text-slate-400" />
            Print Receipt
          </button>

          <div className="flex items-center gap-2">
            {onNewSale && (
              <button
                id="receipt-new-sale-btn"
                onClick={() => {
                  onClose();
                  onNewSale();
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-md shadow-emerald-600/20"
              >
                <PlusCircle className="w-4 h-4" />
                New Sale
              </button>
            )}
            <button
              id="receipt-done-btn"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors border border-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
