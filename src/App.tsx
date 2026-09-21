import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { PageView } from './components/layout/Sidebar';
import { AdminDashboard } from './pages/AdminDashboard';
import { AttendantDashboard } from './pages/AttendantDashboard';
import { StoresPage } from './pages/StoresPage';
import { UsersPage } from './pages/UsersPage';
import { AuditPage } from './pages/AuditPage';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { POSPage } from './pages/POSPage';
import { SalesPage } from './pages/SalesPage';
import { PlaceholderModulePage } from './pages/PlaceholderModulePage';
import { AccessDenied } from './components/common/AccessDenied';
import { LoginPage } from './components/auth/LoginPage';
import {
  ShoppingCart,
  Package,
  Boxes,
  Receipt,
  ArrowLeftRight,
  BarChart3,
  Store,
} from 'lucide-react';

const MainContent: React.FC = () => {
  const { currentUser, currentStore, isAdmin, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageView>('dashboard');
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('ALL');

  // 1. Loading State (prevent flashing unauthenticated content while checking session/profile)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-4">
          <Store className="w-6 h-6 text-emerald-400 animate-pulse" />
        </div>
        <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold text-white tracking-wide">StockFlow Terminal</p>
        <p className="text-xs text-slate-400 mt-1">Verifying authentication & staff profile...</p>
      </div>
    );
  }

  // 2. Unauthenticated State (Render dedicated LoginPage)
  if (!currentUser) {
    return <LoginPage />;
  }

  // Page titles and subtitles
  const getPageHeaderInfo = () => {
    switch (currentPage) {
      case 'dashboard':
        return {
          title: isAdmin ? 'Corporate Dashboard' : `${currentStore?.name ?? 'Store'} Terminal`,
          subtitle: isAdmin
            ? 'Enterprise Overview & Real-Time Performance'
            : `Logged in as ${currentUser.name} (${currentUser.role})`,
        };
      case 'stores':
        return {
          title: 'Store Branches Management',
          subtitle: 'Configure retail branches, addresses, and physical locations',
        };
      case 'users':
        return {
          title: 'Users & Attendants',
          subtitle: 'Manage staff credentials, store assignments, and roles',
        };
      case 'pos':
        return {
          title: 'Point of Sale (POS)',
          subtitle: 'Cart management, barcode search, checkout, and receipt generation',
        };
      case 'products':
        return {
          title: 'Products & Categories',
          subtitle: 'Manage retail catalog, SKU variants, cost, and selling prices',
        };
      case 'inventory':
        return {
          title: 'Inventory & Stock Matrix',
          subtitle: 'Per-store stock levels, low-stock alerts, and manual adjustments',
        };
      case 'sales':
        return {
          title: 'Sales & Transactions',
          subtitle: 'Review transaction records, payment methods, and digital receipts',
        };
      case 'transfers':
        return {
          title: 'Inter-Store Stock Transfers',
          subtitle: 'Transfer accessories between branches with transit verification',
        };
      case 'reports':
        return {
          title: 'Reports & Business Analytics',
          subtitle: 'Financial insights, top-selling accessories, and profit analysis',
        };
      case 'audit':
        return {
          title: 'System Audit Trail',
          subtitle: 'Immutable log of security, inventory, and staff operations',
        };
      default:
        return {
          title: 'StockFlow POS',
          subtitle: 'Multi-Store Inventory Management System',
        };
    }
  };

  const { title, subtitle } = getPageHeaderInfo();

  // Route switch handler
  const renderCurrentView = () => {
    switch (currentPage) {
      case 'dashboard':
        return isAdmin ? (
          <AdminDashboard
            onNavigatePage={(p) => setCurrentPage(p)}
            selectedStoreFilter={selectedStoreFilter}
          />
        ) : (
          <AttendantDashboard
            onStartSale={() => setCurrentPage('pos')}
            onViewInventory={() => setCurrentPage('inventory')}
            onViewSales={() => setCurrentPage('sales')}
          />
        );

      case 'stores':
        return isAdmin ? (
          <StoresPage onNavigateHome={() => setCurrentPage('dashboard')} />
        ) : (
          <AccessDenied requiredRole="Super Admin" onGoBack={() => setCurrentPage('dashboard')} />
        );

      case 'users':
        return isAdmin ? (
          <UsersPage onNavigateHome={() => setCurrentPage('dashboard')} />
        ) : (
          <AccessDenied requiredRole="Super Admin" onGoBack={() => setCurrentPage('dashboard')} />
        );

      case 'audit':
        return isAdmin ? (
          <AuditPage onNavigateHome={() => setCurrentPage('dashboard')} />
        ) : (
          <AccessDenied requiredRole="Super Admin" onGoBack={() => setCurrentPage('dashboard')} />
        );

      case 'pos':
        return <POSPage />;

      case 'products':
        return <ProductsPage />;

      case 'inventory':
        return <InventoryPage />;

      case 'sales':
        return <SalesPage />;

      case 'transfers':
        return isAdmin ? (
          <PlaceholderModulePage
            title="Inter-Store Stock Transfers"
            subtitle="Move inventory securely between physical stores"
            milestone="Milestone 6"
            description="Move stock safely between retail branches with audit tracking, transfer requests, in-transit status handling, and confirmation upon arrival."
            icon={ArrowLeftRight}
            features={[
              'Source and Destination store selection',
              'Stock quantity availability checks',
              'Atomic transfer execution',
              'PENDING, IN_TRANSIT, and COMPLETED statuses',
              'Full audit trail and movement history',
              'Store managers transfer requests',
            ]}
            actionText="Go to Dashboard"
            onActionClick={() => setCurrentPage('dashboard')}
          />
        ) : (
          <AccessDenied requiredRole="Super Admin" onGoBack={() => setCurrentPage('dashboard')} />
        );

      case 'reports':
        return isAdmin ? (
          <PlaceholderModulePage
            title="Business Reports & Analytics"
            subtitle="Enterprise analytics and store performance comparisons"
            milestone="Milestone 5"
            description="Actionable intelligence for the Super Admin: total revenue, gross profit, sales by store, top-selling accessories, fastest-moving inventory, and payment method summaries."
            icon={BarChart3}
            features={[
              'Daily, Weekly, Monthly, and Annual revenue',
              'Cross-store performance comparison leaderboards',
              'Top-selling phone and laptop accessories',
              'Gross profit and margin analytics',
              'Export reports (CSV / PDF ready formats)',
              'Dead stock & slow-moving item alerts',
            ]}
            actionText="Go to Dashboard"
            onActionClick={() => setCurrentPage('dashboard')}
          />
        ) : (
          <AccessDenied requiredRole="Super Admin" onGoBack={() => setCurrentPage('dashboard')} />
        );

      default:
        return null;
    }
  };

  return (
    <AppLayout
      currentPage={currentPage}
      onSelectPage={(page) => setCurrentPage(page)}
      pageTitle={title}
      pageSubtitle={subtitle}
      selectedStoreFilter={selectedStoreFilter}
      onSelectStoreFilter={setSelectedStoreFilter}
    >
      {renderCurrentView()}
    </AppLayout>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
