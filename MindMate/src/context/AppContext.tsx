import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useToast, ToastMessage } from '../hooks/useToast';
import { supabase, isSupabaseConfigured, SupabaseConfigError } from '../lib/supabase';
import { updateProfile, getProfile } from '../lib/db';

interface Notification {
  id: number;
  text: string;
  isRead: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  goal?: string;
  avatar?: string;
  bio?: string;
}

interface AppContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; goal?: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<AuthUser>) => Promise<void>;
  isOnline: boolean;
  toggleOnline: () => void;
  notifications: Notification[];
  toasts: ToastMessage[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  activeModal: string | null;
  setActiveModal: (modalId: string | null) => void;
  sidebarWidth: number;
  setSidebarWidth: (w: number) => void;
  isSidebarCollapsed: boolean;
  toggleSidebarCollapse: () => void;
  isMobileNavOpen: boolean;
  setIsMobileNavOpen: (open: boolean) => void;
  toggleMobileNav: () => void;
  isDraggingSidebar: boolean;
  setIsDraggingSidebar: (dragging: boolean) => void;
  language: string;
  setLanguage: (lang: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { isOnline, toggleOnline } = useOnlineStatus();
  const { toasts, showToast, removeToast } = useToast();
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Sidebar resizable & collapsible state
  const [sidebarWidth, setSidebarWidthState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mindmate_sidebar_width');
      return saved ? Math.max(200, Math.min(360, parseInt(saved, 10))) : 240;
    } catch {
      return 240;
    }
  });

  const [isSidebarCollapsed, setIsSidebarCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mindmate_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);

  const setSidebarWidth = (w: number) => {
    const clamped = Math.max(200, Math.min(360, w));
    setSidebarWidthState(clamped);
    try {
      localStorage.setItem('mindmate_sidebar_width', clamped.toString());
    } catch {}
  };

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsedState(prev => {
      const next = !prev;
      try {
        localStorage.setItem('mindmate_sidebar_collapsed', next.toString());
      } catch {}
      return next;
    });
  };

  const toggleMobileNav = () => {
    setIsMobileNavOpen(prev => !prev);
  };

  const [language, setLanguageState] = useState<string>(() => {
    try {
      return localStorage.getItem('mindmate_language') || 'en';
    } catch {
      return 'en';
    }
  });

  const setLanguage = (lang: string) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('mindmate_language', lang);
    } catch {}
  };

  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [notifications] = useState<Notification[]>([
    { id: 1, text: 'New insight available on OOP', isRead: false },
    { id: 2, text: 'Sarah K. challenged you to an Adaptive Battle', isRead: false },
    { id: 3, text: 'You completed your daily goal!', isRead: true },
  ]);

  // Apply saved theme on startup
  useEffect(() => {
    const savedTheme = localStorage.getItem('mindmate_theme') || 'light';
    document.documentElement.dataset.theme = savedTheme;
  }, []);

  useEffect(() => {
    // Without Supabase credentials there is no session to restore; finish loading
    // immediately so public routes render and protected routes redirect to /login.
    if (!isSupabaseConfigured) {
      setIsAuthLoading(false);
      return;
    }

    // Safety net: never leave the app stuck on the auth spinner if Supabase is
    // unreachable (e.g. wrong URL, offline, DNS failure).
    const authLoadingTimeout = setTimeout(() => {
      console.warn('[MindMate] Supabase session check timed out; continuing as signed out.');
      setIsAuthLoading(false);
    }, 8000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        let avatar = session.user.user_metadata?.avatar;
        let goal = session.user.user_metadata?.goal;
        let bio = session.user.user_metadata?.bio;

        // Try reading profile from Supabase profiles table
        try {
          const profileRes = await getProfile(session.user.id);
          if (profileRes.data) {
            avatar = (profileRes.data as any).avatar || avatar;
            goal = profileRes.data.goal || goal;
            bio = (profileRes.data as any).bio || bio;
          }
        } catch {
          // Continue with session metadata
        }

        setUser({
          id: session.user.id,
          name: session.user.user_metadata.name || session.user.email?.split('@')[0],
          email: session.user.email!,
          goal,
          avatar: avatar || '/avatars/avatar-01.webp',
          bio,
        });
      }
    }).catch((err) => {
      console.warn('[MindMate] Failed to restore Supabase session:', err);
    }).finally(() => {
      clearTimeout(authLoadingTimeout);
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        let avatar = session.user.user_metadata?.avatar;
        let goal = session.user.user_metadata?.goal;
        let bio = session.user.user_metadata?.bio;

        try {
          const profileRes = await getProfile(session.user.id);
          if (profileRes.data) {
            avatar = (profileRes.data as any).avatar || avatar;
            goal = profileRes.data.goal || goal;
            bio = (profileRes.data as any).bio || bio;
          }
        } catch {}

        setUser({
          id: session.user.id,
          name: session.user.user_metadata.name || session.user.email?.split('@')[0],
          email: session.user.email!,
          goal,
          avatar: avatar || '/avatars/avatar-01.webp',
          bio,
        });
      } else {
        setUser(null);
      }
      setIsAuthLoading(false);
    });

    return () => {
      clearTimeout(authLoadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    if (!isSupabaseConfigured) throw new SupabaseConfigError();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const register = async (data: {
    name: string;
    email: string;
    password: string;
    goal?: string;
  }) => {
    if (!isSupabaseConfigured) throw new SupabaseConfigError();
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
          goal: data.goal,
          avatar: '/avatars/avatar-01.webp',
        },
      },
    });
    if (error) throw error;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const updateUser = async (data: Partial<AuthUser>) => {
    if (!user) return;

    // Optimistically update local state
    const updated = { ...user, ...data };
    setUser(updated);
    try {
      localStorage.setItem('mindmate_user', JSON.stringify(updated));
    } catch {}

    // Persist to Supabase Auth metadata
    try {
      await supabase.auth.updateUser({
        data: {
          name: updated.name,
          goal: updated.goal,
          avatar: updated.avatar,
          bio: updated.bio,
        },
      });
    } catch (err) {
      console.warn('Failed to update Supabase Auth metadata:', err);
    }

    // Persist to Supabase profiles table
    try {
      await updateProfile(user.id, {
        name: updated.name,
        goal: updated.goal,
        avatar: updated.avatar,
        bio: updated.bio,
      } as any);
    } catch (err) {
      console.warn('Failed to update Supabase profiles table:', err);
    }
  };

  return (
    <AppContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isAuthLoading,
        login,
        register,
        logout,
        updateUser,
        isOnline,
        toggleOnline,
        notifications,
        toasts,
        showToast,
        removeToast,
        activeModal,
        setActiveModal,
        sidebarWidth,
        setSidebarWidth,
        isSidebarCollapsed,
        toggleSidebarCollapse,
        isMobileNavOpen,
        setIsMobileNavOpen,
        toggleMobileNav,
        isDraggingSidebar,
        setIsDraggingSidebar,
        language,
        setLanguage,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
