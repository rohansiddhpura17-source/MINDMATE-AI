import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAppContext } from '../../context/AppContext';
import { ToastContainer } from '../ui/Toast';
import { AlertCircle } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  pageTitle: string;
  pageSubtitle?: string;
}

export function AppShell({ children, pageTitle, pageSubtitle }: AppShellProps) {
  const {
    isOnline,
    sidebarWidth,
    isSidebarCollapsed,
    isDraggingSidebar
  } = useAppContext();

  // Track if current screen is desktop (>= 768px)
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const currentSidebarWidth = isSidebarCollapsed ? 70 : sidebarWidth;
  const contentMarginLeft = isDesktop ? currentSidebarWidth : 0;

  return (
    <div className="min-h-screen bg-background flex text-dark font-['Inter',sans-serif] overflow-x-hidden">
      <Sidebar />
      <div
        style={{
          marginLeft: `${contentMarginLeft}px`,
          width: isDesktop ? `calc(100vw - ${currentSidebarWidth}px)` : '100%'
        }}
        className={`flex-1 flex flex-col min-h-screen max-w-full overflow-x-hidden ${
          !isDraggingSidebar ? 'transition-[margin-left,width] duration-200' : ''
        }`}
      >
        <Header title={pageTitle} subtitle={pageSubtitle} />

        {!isOnline && (
          <div className="bg-warning text-yellow-900 px-6 py-2 flex items-center justify-center gap-2 text-sm font-medium z-20 shadow-sm relative">
            <AlertCircle className="h-4 w-4" />
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
