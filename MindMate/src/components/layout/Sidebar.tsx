import React from 'react';
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
  Brain
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
  { label: 'Materials', icon: Files, path: '/materials' },
  { label: 'Insights', icon: Lightbulb, path: '/insights' },
];

export function Sidebar() {
  const { isOnline, toggleOnline, syncState, triggerSync } = useAppContext();

  return (
    <aside className="w-[240px] fixed inset-y-0 left-0 bg-surface border-r border-border flex flex-col z-40">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-primary text-white p-2 rounded-xl">
          <Brain className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-bold text-xl leading-tight">MindMate</h1>
          <p className="text-[10px] font-bold text-primary tracking-wider uppercase">Adaptive Learning Twin</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto pb-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative",
              isActive 
                ? "text-primary bg-indigo-50" 
                : "text-muted hover:text-dark hover:bg-gray-50"
            )}
          >
            {({ isActive }) => (
              <>
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />}
                <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted")} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}

        <div className="my-4 border-t border-border px-3 pt-4">
          <NavLink
            to="/friends"
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative",
              isActive ? "text-primary bg-indigo-50" : "text-muted hover:text-dark hover:bg-gray-50"
            )}
          >
            {({ isActive }) => (
              <>
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />}
                <Users className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted")} />
                Friends
              </>
            )}
          </NavLink>
        </div>
      </nav>

      <div className="p-4 border-t border-border mt-auto space-y-4">
        <div 
          className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
          onClick={() => {
            if (syncState.pendingCount > 0 && isOnline) {
              triggerSync();
            } else {
              toggleOnline();
            }
          }}
          title={syncState.pendingCount > 0 ? "Click to synchronize pending offline changes" : "Toggle online status"}
        >
          <StatusIndicator 
            isOnline={isOnline}
            isSyncing={syncState.isSyncing}
            pendingCount={syncState.pendingCount}
            hasError={Boolean(syncState.error)}
          />
        </div>

        <div className="flex items-center gap-3 px-3">
          <Avatar fallback="AL" size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-dark truncate">Alex Learner</p>
            <p className="text-xs text-muted truncate">Pro Plan</p>
          </div>
          <NavLink to="/settings" className="text-muted hover:text-dark">
            <Settings className="h-5 w-5" />
          </NavLink>
        </div>
      </div>
    </aside>
  );
}
