import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { StorageEngine } from '../db/storageEngine';
import { PaymentMethod, Sale, Store } from '../types';
import { formatNaira } from '../utils/currency';
import { ReceiptModal } from '../components/pos/ReceiptModal';
import {
  Receipt,
  Search,
  Filter,
  CreditCard,
  Banknote,
  ArrowRightLeft,
  TrendingUp,
  ShoppingBag,
  Store as StoreIcon,
  Calendar,
  Clock,
  Printer,
  X,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

export const SalesPage: React.FC = () => {
  const { currentUser } = useAuth();
  const storage = StorageEngine.getInstance();

  const stores = useMemo(() => storage.getStores(), []);
  const allSales = useMemo(() => storage.getSales(), []);

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => {
    if (currentUser?.role === 'ATTENDANT' && currentUser.assignedStoreId) {
      return currentUser.assignedStoreId;
    }
    return 'ALL';
  });
  const [selectedPayment, setSelectedPayment] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'TODAY' | '7DAYS' | '30DAYS' | 'ALL'>('ALL');

  // Receipt Modal State
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<Sale | null>(null);

  // Store map
  const storeMap = useMemo(() => {
    const map = new Map<string, Store>();
    for (const store of stores) {
      map.set(store.id, store);
    }
    return map;
  }, [stores]);

  // Scoped Sales based on RBAC & Filters
  const filteredSales = useMemo(() => {
    let sales = [...allSales];

    // Attendant isolation: strictly view assigned store
    if (currentUser?.role === 'ATTENDANT' && currentUser.assignedStoreId) {
      sales = sales.filter((s) => s.storeId === currentUser.assignedStoreId);
    } else if (selectedStoreId !== 'ALL') {
      sales = sales.filter((s) => s.storeId === selectedStoreId);
    }

    // Payment method filter
    if (selectedPayment !== 'ALL') {
      sales = sales.filter((s) => s.paymentMethod === selectedPayment);
    }

    // Date range filter
    if (dateFilter !== 'ALL') {
      const now = new Date();
      sales = sales.filter((s) => {
        const saleDate = new Date(s.createdAt);
        const diffMs = now.getTime() - saleDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (dateFilter === 'TODAY') {
          return saleDate.toDateString() === now.toDateString();
        } else if (dateFilter === '7DAYS') {
          return diffDays <= 7;
        } else if (dateFilter === '30DAYS') {
          return diffDays <= 30;
        }
        return true;
      });
    }

    // Search query filter (Transaction number, attendant, or SKU/item in sale)
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      sales = sales.filter((s) => {
        const matchTrx = s.transactionNumber.toLowerCase().includes(q);
        const matchAttendant = s.attendantName.toLowerCase().includes(q);
        const matchStore = storeMap.get(s.storeId)?.name.toLowerCase().includes(q);
        const matchItem = s.items.some(
          (item) =>
            item.productName.toLowerCase().includes(q) ||
            item.sku.toLowerCase().includes(q)
        );
        return matchTrx || matchAttendant || matchStore || matchItem;
      });
    }

    // Sort descending by date
    return sales.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [allSales, currentUser, selectedStoreId, selectedPayment, dateFilter, searchQuery, storeMap]);

  // Financial Metrics Summary
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let cashTotal = 0;
    let transferTotal = 0;
    let posTotal = 0;

    for (const sale of filteredSales) {
      totalRevenue += sale.total;
      if (sale.paymentMethod === 'CASH') cashTotal += sale.total;
      else if (sale.paymentMethod === 'TRANSFER') transferTotal += sale.total;
      else if (sale.paymentMethod === 'POS') posTotal += sale.total;
    }

    return {
      totalRevenue,
      transactionCount: filteredSales.length,
      cashTotal,
      transferTotal,
      posTotal,
    };
  }, [filteredSales]);

  const getPaymentBadge = (method: PaymentMethod) => {
    switch (method) {
      case 'CASH':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-800/30">
            <Banknote className="w-3 h-3" />
            CASH
          </span>
        );
      case 'TRANSFER':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-800/30">
            <ArrowRightLeft className="w-3 h-3" />
            TRANSFER
          </span>
        );
      case 'POS':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded-full border border-purple-800/30">
            <CreditCard className="w-3 h-3" />
            POS CARD
          </span>
        );
    }
  };

  return (
    <div id="sales-history-page" className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Sales Transactions
            </h1>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {filteredSales.length} Total
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {currentUser?.role === 'ADMIN'
              ? 'Multi-store sales audit and receipt management across all 11 retail branches.'
              : `Branch sales transactions for ${storeMap.get(currentUser?.assignedStoreId || '')?.name ?? 'your store'}.`}
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Revenue
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white mt-2 font-mono">
            {formatNaira(metrics.totalRevenue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Across {metrics.transactionCount} completed orders
          </div>
        </div>

        {/* Cash Sales */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Cash Volume
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-2 font-mono">
            {formatNaira(metrics.cashTotal)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {metrics.totalRevenue > 0
              ? `${Math.round((metrics.cashTotal / metrics.totalRevenue) * 100)}% of total volume`
              : '0%'}
          </div>
        </div>

        {/* Transfer Sales */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Bank Transfers
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-400 mt-2 font-mono">
            {formatNaira(metrics.transferTotal)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {metrics.totalRevenue > 0
              ? `${Math.round((metrics.transferTotal / metrics.totalRevenue) * 100)}% of total volume`
              : '0%'}
          </div>
        </div>

        {/* POS Card Sales */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              POS Terminals
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-400 mt-2 font-mono">
            {formatNaira(metrics.posTotal)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {metrics.totalRevenue > 0
              ? `${Math.round((metrics.posTotal / metrics.totalRevenue) * 100)}% of total volume`
              : '0%'}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            id="sales-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Trx #, SKU, attendant, or product..."
            className="w-full pl-10 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Store Selector (Super Admin Only) */}
        {currentUser?.role === 'ADMIN' && (
          <div className="w-full md:w-auto">
            <select
              id="sales-store-filter"
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full md:w-auto bg-slate-950 border border-slate-800 text-xs font-semibold text-white rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All 11 Retail Stores</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.location.split(',')[0]})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Payment Method Filter */}
        <div className="w-full md:w-auto">
          <select
            id="sales-payment-filter"
            value={selectedPayment}
            onChange={(e) => setSelectedPayment(e.target.value)}
            className="w-full md:w-auto bg-slate-950 border border-slate-800 text-xs font-semibold text-white rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL">All Payment Methods</option>
            <option value="CASH">Cash Only</option>
            <option value="TRANSFER">Transfer Only</option>
            <option value="POS">POS Card Only</option>
          </select>
        </div>

        {/* Date Filter */}
        <div className="w-full md:w-auto">
          <select
            id="sales-date-filter"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="w-full md:w-auto bg-slate-950 border border-slate-800 text-xs font-semibold text-white rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL">All Recorded Dates</option>
            <option value="TODAY">Today's Transactions</option>
            <option value="7DAYS">Past 7 Days</option>
            <option value="30DAYS">Past 30 Days</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Transaction #</th>
                <th className="py-3 px-4">Store Branch</th>
                <th className="py-3 px-4">Attendant</th>
                <th className="py-3 px-4">Items Summary</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Total Amount</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="text-sm font-medium text-slate-400">No transactions found</p>
                    <p className="text-xs text-slate-600 mt-1">
                      No sales match your current search and filter criteria.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const store = storeMap.get(sale.storeId);
                  const dateObj = new Date(sale.createdAt);
                  const formattedDate = dateObj.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });
                  const formattedTime = dateObj.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  const totalItems = sale.items.reduce((s, i) => s + i.quantity, 0);

                  return (
                    <tr
                      key={sale.id}
                      id={`sale-row-${sale.id}`}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Trx Number */}
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-white">
                          {sale.transactionNumber}
                        </span>
                      </td>

                      {/* Store */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">
                          {store?.name ?? sale.storeId}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                          {store?.location.split(',')[0]}
                        </div>
                      </td>

                      {/* Attendant */}
                      <td className="py-3 px-4 text-slate-300 font-medium">
                        {sale.attendantName}
                      </td>

                      {/* Items */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-200">{totalItems}</span>
                          <span className="text-slate-400">
                            {totalItems === 1 ? 'item' : 'items'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[180px]">
                          {sale.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                        </div>
                      </td>

                      {/* Payment Method */}
                      <td className="py-3 px-4">
                        {getPaymentBadge(sale.paymentMethod)}
                      </td>

                      {/* Total */}
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          {formatNaira(sale.total)}
                        </span>
                      </td>

                      {/* Date & Time */}
                      <td className="py-3 px-4 text-slate-400">
                        <div>{formattedDate}</div>
                        <div className="text-[10px] text-slate-500">{formattedTime}</div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <button
                          id={`view-receipt-action-${sale.id}`}
                          onClick={() => setSelectedSaleForReceipt(sale)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors border border-slate-700 font-semibold"
                        >
                          <Receipt className="w-3.5 h-3.5 text-emerald-400" />
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

      {/* Customer Receipt Modal */}
      {selectedSaleForReceipt && (
        <ReceiptModal
          sale={selectedSaleForReceipt}
          store={storeMap.get(selectedSaleForReceipt.storeId)}
          onClose={() => setSelectedSaleForReceipt(null)}
        />
      )}
    </div>
  );
};
