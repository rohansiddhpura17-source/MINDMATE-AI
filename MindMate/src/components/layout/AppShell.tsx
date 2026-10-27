import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAppContext } from '../../context/AppContext';
import { ToastContainer } from '../ui/Toast';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../utils';

interface AppShellProps {
  children: React.ReactNode;
  pageTitle: string;
  pageSubtitle?: string;
}

export function AppShell({ children, pageTitle, pageSubtitle }: AppShellProps) {
  const {
    isOnline,
    isSidebarCollapsed
  } = useAppContext();

  return (
    <div className="min-h-screen bg-background flex text-dark font-['Inter',sans-serif] overflow-x-hidden">
      <Sidebar />
      <div
        className={cn(
          "flex-1 flex flex-col min-h-screen w-full min-w-0 overflow-x-hidden transition-[margin-left] duration-200",
          isSidebarCollapsed ? "md:ml-[72px]" : "md:ml-64"
        )}
      >
        <Header title={pageTitle} subtitle={pageSubtitle} />

        {!isOnline && (
          <div className="bg-[#FFFBEB] text-[#92400E] border-b border-[#FDE68A] px-6 py-2 flex items-center justify-center gap-2 text-sm font-semibold z-20 shadow-xs relative">
            <AlertCircle className="h-4 w-4 shrink-0" />
            You're offline. Core learning features are still available.
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto w-full max-w-7xl mx-auto">
          {children}
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
