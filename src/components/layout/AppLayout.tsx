import React, { useState } from 'react';
import { Sidebar, PageView } from './Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
  currentPage: PageView;
  onSelectPage: (page: PageView) => void;
  pageTitle: string;
  pageSubtitle?: string;
  selectedStoreFilter?: string;
  onSelectStoreFilter?: (storeId: string) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentPage,
  onSelectPage,
  pageTitle,
  pageSubtitle,
  selectedStoreFilter,
  onSelectStoreFilter,
  children,
}) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans antialiased">
      {/* Sidebar navigation */}
      <Sidebar
        currentPage={currentPage}
        onSelectPage={onSelectPage}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header
          pageTitle={pageTitle}
          pageSubtitle={pageSubtitle}
          onOpenMobileMenu={() => setIsMobileOpen(true)}
          selectedStoreFilter={selectedStoreFilter}
          onSelectStoreFilter={onSelectStoreFilter}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
