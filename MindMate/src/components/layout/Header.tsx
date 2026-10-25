import React, { useState, useRef, useEffect } from 'react';
import { Search } from '../ui/Search';
import { Avatar } from '../ui/Avatar';
import { Bell, ChevronDown, Settings, LogOut, User, Menu, Globe } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../utils';
import { SUPPORTED_LANGUAGES, LanguageCode } from '../../data/learningContent';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { notifications, user, logout, toggleMobileNav, language, setLanguage } = useAppContext();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setShowLanguage(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Initials from user name
  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : 'AL';

  return (
    <header className="h-[72px] bg-surface border-b border-border flex items-center justify-between px-4 sm:px-8 sticky top-0 z-30 w-full">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={toggleMobileNav}
          className="p-2 -ml-2 rounded-xl text-muted hover:text-dark hover:bg-gray-100 dark:hover:bg-slate-800 md:hidden shrink-0"
          title="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h2 className="text-xl sm:text-[28px] font-bold text-dark leading-tight truncate">{title}</h2>
          {subtitle && <p className="text-xs sm:text-sm text-muted truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <Search placeholder="Search..." containerClassName="w-56 hidden md:block" />

        {/* Language Selector */}
        <div className="relative" ref={langRef}>
          <button
            type="button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border bg-surface hover:bg-gray-50 dark:hover:bg-slate-800 text-xs font-semibold text-dark transition-all duration-150 shadow-sm"
            onClick={() => {
              setShowLanguage(!showLanguage);
              setShowNotifications(false);
              setShowProfile(false);
            }}
            title="Change learning language"
          >
            <span className="text-base leading-none">{SUPPORTED_LANGUAGES.find((l) => l.code === language)?.flag || '🇺🇸'}</span>
            <span className="hidden sm:inline uppercase tracking-wider text-[11px] font-bold">
              {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.code || 'en'}
            </span>
            <ChevronDown className="h-3 w-3 text-muted" />
          </button>

          {showLanguage && (
            <div className="absolute right-0 mt-2 w-48 bg-surface rounded-card shadow-xl border border-border py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 border-b border-border text-[11px] font-semibold text-muted uppercase tracking-wider">
                Language
              </div>
              {SUPPORTED_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    setLanguage(l.code);
                    setShowLanguage(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors text-left',
                    language === l.code
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-dark hover:bg-gray-50 dark:hover:bg-slate-800/60'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base leading-none">{l.flag}</span>
                    <span>{l.label}</span>
                  </span>
                  {language === l.code && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            className="p-2 text-muted hover:text-dark hover:bg-gray-50 rounded-full transition-colors relative"
            onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false); }}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-danger rounded-full ring-2 ring-surface" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-surface rounded-card shadow-lg border border-border py-2 z-50">
              <div className="px-4 py-2 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-xs text-primary cursor-pointer hover:underline">Mark all read</span>
                )}
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm border-b border-border last:border-0',
                      !n.isRead && 'bg-indigo-50/50'
                    )}
                  >
                    <div className="flex gap-3">
                      {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
                      <p className="text-dark/90">{n.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile menu */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => { setShowProfile(!showProfile); setShowNotifications(false); }}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity py-1 px-1 rounded-lg"
          >
            <Avatar src={user?.avatar} fallback={initials} size="sm" />
            <span className="hidden md:block text-sm font-medium text-dark">{user?.name ?? 'Alex'}</span>
            <ChevronDown className="h-4 w-4 text-muted" />
          </button>

          {showProfile && (
            <div className="absolute right-0 mt-2 w-48 bg-surface rounded-card shadow-lg border border-border py-1.5 z-50">
              <div className="px-4 py-2 border-b border-border mb-1">
                <p className="text-sm font-semibold text-dark truncate">{user?.name ?? 'Alex'}</p>
                <p className="text-xs text-muted truncate">{user?.email ?? 'alex@mindmate.app'}</p>
              </div>
              <button
                onClick={() => { setShowProfile(false); navigate('/profile'); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-dark hover:bg-gray-50 transition-colors"
              >
                <User className="h-4 w-4 text-muted" /> Profile
              </button>
              <button
                onClick={() => { setShowProfile(false); navigate('/settings'); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-dark hover:bg-gray-50 transition-colors"
              >
                <Settings className="h-4 w-4 text-muted" /> Settings
              </button>
              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
