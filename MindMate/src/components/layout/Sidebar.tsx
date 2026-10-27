import React, { useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  BookOpen,
  Dumbbell,
  BrainCircuit,
  BarChart2,
  Calendar,
  Files,
  Lightbulb,
  Users,
  Settings,
  UserRound,
  Brain,
  PanelLeftClose,
  PanelLeftOpen,
  Trophy,
  Video,
  X
} from 'lucide-react';
import { cn } from '../../utils';
import { useAppContext } from '../../context/AppContext';
import { Avatar } from '../ui/Avatar';
import { StatusIndicator } from '../ui/StatusIndicator';

const NAV_ITEMS = [
  { label: 'Home', icon: Home, path: '/home' },
  { label: 'Learn', icon: BookOpen, path: '/learn' },
  { label: 'Practice', icon: Dumbbell, path: '/practice' },
  { label: 'Learning Twin', icon: BrainCircuit, path: '/learning-twin' },
  { label: 'Progress', icon: BarChart2, path: '/progress' },
  { label: 'Planner', icon: Calendar, path: '/planner' },
  { label: 'Zoom Classes', icon: Video, path: '/zoom' },
  { label: 'Materials', icon: Files, path: '/materials' },
  { label: 'Insights', icon: Lightbulb, path: '/insights' },
  { label: 'Achievements', icon: Trophy, path: '/learning-win' },
  { label: 'My Profile', icon: UserRound, path: '/profile' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

export function Sidebar() {
  const {
    isOnline,
    toggleOnline,
    user,
    isSidebarCollapsed,
    toggleSidebarCollapse,
    isMobileNavOpen,
    setIsMobileNavOpen
  } = useAppContext();

  const sidebarRef = useRef<HTMLElement>(null);
  const initial = user?.name ? user.name.substring(0, 2).toUpperCase() : 'AL';

  const handleNavClick = () => {
    if (isMobileNavOpen) {
      setIsMobileNavOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={() => setIsMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Responsive Sidebar Component */}
      <aside
        ref={sidebarRef}
        aria-label="Sidebar navigation"
        className={cn(
          "fixed inset-y-0 left-0 bg-surface border-r border-border flex flex-col z-40 select-none transition-all duration-200",
          // Mobile drawer slide-in
          isMobileNavOpen ? "translate-x-0 w-72 shadow-2xl" : "-translate-x-full md:translate-x-0",
          // Desktop stable widths (Expanded: 256px / Collapsed: 72px)
          isSidebarCollapsed ? "md:w-[72px]" : "md:w-64"
        )}
      >
        {/* Top Header / Logo & Collapse Toggle */}
        <div className={cn(
          "h-[72px] flex items-center border-b border-border/60 shrink-0",
          isSidebarCollapsed ? "justify-center px-2" : "justify-between px-4"
        )}>
          {isSidebarCollapsed ? (
            /* Collapsed Desktop: Fully visible, centered brand icon with expand click handler */
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              className="p-2 rounded-xl bg-primary text-white shadow-xs hover:bg-primary-hover transition-transform hover:scale-105 flex items-center justify-center focus:outline-hidden"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <Brain className="h-6 w-6" />
            </button>
          ) : (
            /* Expanded Desktop & Mobile Drawer: Full brand identity + Collapse control */
            <>
              <div className="flex items-center gap-3 overflow-hidden min-w-0">
                <div className="bg-primary text-white p-2 rounded-xl shrink-0 shadow-xs">
                  <Brain className="h-6 w-6" />
                </div>
                {(!isSidebarCollapsed || isMobileNavOpen) && (
                  <div className="min-w-0">
                    <h1 className="font-bold text-lg text-dark leading-tight truncate">MindMate</h1>
                    <p className="text-[10px] font-bold text-primary tracking-wider uppercase truncate">Adaptive Twin</p>
                  </div>
                )}
              </div>

              {/* Desktop Collapse Button */}
              <button
                type="button"
                onClick={toggleSidebarCollapse}
                className="p-1.5 rounded-lg text-muted hover:text-dark hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors hidden md:inline-flex items-center justify-center shrink-0"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </>
          )}

          {/* Mobile Drawer Close Button */}
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(false)}
            className="p-1.5 rounded-lg text-muted hover:text-dark hover:bg-gray-100 dark:hover:bg-slate-800 md:hidden"
            title="Close menu"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Collapsed Desktop Dedicated Expand Control Row */}
        {isSidebarCollapsed && (
          <div className="hidden md:flex justify-center py-2 border-b border-border/40 shrink-0 bg-gray-50/50 dark:bg-slate-900/30">
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              className="p-1.5 rounded-lg text-muted hover:text-dark hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center shrink-0"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              title={isSidebarCollapsed ? item.label : undefined}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative group",
                isActive
                  ? "text-[#4F46E5] bg-[#EEF2FF] dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold shadow-2xs"
                  : "text-muted hover:text-dark hover:bg-[#F8FAFC] dark:hover:bg-slate-800/70",
                isSidebarCollapsed && "md:justify-center md:px-0 md:py-2.5"
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                  )}
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-muted group-hover:text-dark")} />
                  {(!isSidebarCollapsed || isMobileNavOpen) && (
                    <span className="truncate">{item.label}</span>
                  )}
                  {/* Floating tooltip in collapsed desktop mode */}
                  {isSidebarCollapsed && (
                    <div className="fixed left-[76px] ml-2 hidden md:group-hover:block z-50 bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-md shadow-lg pointer-events-none whitespace-nowrap">
                      {item.label}
                    </div>
                  )}
                </>
              )}
            </NavLink>
          ))}

          <div className="my-2.5 border-t border-border px-1 pt-2.5">
            <NavLink
              to="/friends"
              onClick={handleNavClick}
              title={isSidebarCollapsed ? "Friends" : undefined}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative group",
                isActive
                  ? "text-[#4F46E5] bg-[#EEF2FF] dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold"
                  : "text-muted hover:text-dark hover:bg-[#F8FAFC] dark:hover:bg-slate-800/70",
                isSidebarCollapsed && "md:justify-center md:px-0 md:py-2.5"
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                  )}
                  <Users className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-muted group-hover:text-dark")} />
                  {(!isSidebarCollapsed || isMobileNavOpen) && <span className="truncate">Friends</span>}
                  {isSidebarCollapsed && (
                    <div className="fixed left-[76px] ml-2 hidden md:group-hover:block z-50 bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-md shadow-lg pointer-events-none whitespace-nowrap">
                      Friends
                    </div>
                  )}
                </>
              )}
            </NavLink>
          </div>
        </nav>

        {/* Footer Area: Online Status & Profile */}
        <div className="p-3 border-t border-border mt-auto space-y-2.5 shrink-0">
          {/* Online status indicator */}
          <div
            className={cn(
              "flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-900/60 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors border border-border/40",
              isSidebarCollapsed && "md:justify-center md:px-1"
            )}
            onClick={toggleOnline}
            title={isOnline ? "Status: Online (Click to toggle)" : "Status: Offline (Click to toggle)"}
          >
            <StatusIndicator isOnline={isOnline} />
          </div>

          {/* User profile row */}
          <div className={cn(
            "flex items-center gap-3 px-1",
            isSidebarCollapsed && "md:justify-center md:px-0"
          )}>
            <Avatar src={user?.avatar} fallback={initial} size="sm" />
            {(!isSidebarCollapsed || isMobileNavOpen) && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-dark truncate">{user?.name || 'Alex Learner'}</p>
                  <p className="text-[10px] text-muted truncate">Active Learner</p>
                </div>
                <NavLink
                  to="/settings"
                  onClick={handleNavClick}
                  className="text-muted hover:text-dark p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  title="Settings"
                  aria-label="Settings"
                >
                  <Settings className="h-4 w-4" />
                </NavLink>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
