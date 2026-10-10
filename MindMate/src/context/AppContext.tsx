import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useToast, ToastMessage } from '../hooks/useToast';
import { authApi, LoginInput, RegisterInput } from '../services/api/authApi';
import { apiClient } from '../services/api/client';
import { syncManager, SyncStatusState } from '../services/storage/syncManager';

interface Notification {
  id: number;
  text: string;
  isRead: boolean;
}

export interface AuthUser {
  id?: string;
  name: string;
  email: string;
  role?: string;
  goal?: string | null;
}

interface AppContextType {
  // Auth
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoadingUser: boolean;
  login: (user: AuthUser) => void;
  loginWithCredentials: (credentials: LoginInput) => Promise<AuthUser>;
  registerWithCredentials: (data: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  // Online & Sync status
  isOnline: boolean;
  toggleOnline: () => void;
  syncState: SyncStatusState;
  triggerSync: () => Promise<any>;
  // Notifications
  notifications: Notification[];
  // Toasts
  toasts: ToastMessage[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  // Modal
  activeModal: string | null;
  setActiveModal: (modalId: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { isOnline: manualOnline, toggleOnline } = useOnlineStatus();
  const { toasts, showToast, removeToast } = useToast();
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [syncState, setSyncState] = useState<SyncStatusState>({
    isBackendReachable: true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    error: null,
    activeUserId: null,
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Aggregate authentic notifications (friend requests, challenge invites)
  useEffect(() => {
    let isCancelled = false;
    async function loadRealNotifications() {
      if (!user?.id) {
        setNotifications([]);
        return;
      }

      try {
        const items: Notification[] = [];
        let notifId = 1;

        // 1. Incoming friend requests
        const friendsRes = await apiClient<{ success?: boolean; receivedRequests?: any[] }>(
          '/api/social/friends'
        ).catch(() => null);
        if (friendsRes?.receivedRequests && Array.isArray(friendsRes.receivedRequests)) {
          for (const req of friendsRes.receivedRequests) {
            items.push({
              id: notifId++,
              text: `${req.requester?.name || 'A learner'} sent you a friend request`,
              isRead: false,
            });
          }
        }

        // 2. Incoming quiz challenges
        const challengesRes = await apiClient<{ challenges?: any[] }>(
          '/api/social/challenges'
        ).catch(() => null);
        if (challengesRes?.challenges && Array.isArray(challengesRes.challenges)) {
          const pendingIncoming = challengesRes.challenges.filter(
            (c: any) => c.status === 'PENDING' && c.opponentId === user.id
          );
          for (const ch of pendingIncoming) {
            items.push({
              id: notifId++,
              text: `${ch.challenger?.name || 'A friend'} challenged you to an adaptive quiz duel!`,
              isRead: false,
            });
          }
        }

        if (!isCancelled) {
          setNotifications(items);
        }
      } catch {
        if (!isCancelled) {
          setNotifications([]);
        }
      }
    }

    loadRealNotifications();

    return () => {
      isCancelled = true;
    };
  }, [user?.id]);

  // Subscribe to syncManager state
  useEffect(() => {
    const unsubscribe = syncManager.subscribe((s) => {
      setSyncState(s);
    });
    syncManager.startPeriodicSync(30000);

    return () => {
      unsubscribe();
      syncManager.stopPeriodicSync();
    };
  }, []);

  // Restore authenticated session from HTTP-only cookie on mount
  useEffect(() => {
    let mounted = true;
    async function restoreSession() {
      try {
        const response = await authApi.getMe();
        if (mounted && response.success && response.user) {
          setUser(response.user);
          syncManager.setActiveUser(response.user.id);
          // Proactively attempt synchronization upon session restoration
          syncManager.checkAndSync();
        }
      } catch (err) {
        if (mounted) {
          setUser(null);
          syncManager.setActiveUser(null);
        }
      } finally {
        if (mounted) {
          setIsLoadingUser(false);
        }
      }
    }
    restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  const login = (authUser: AuthUser) => {
    setUser(authUser);
    if (authUser.id) syncManager.setActiveUser(authUser.id);
  };

  const loginWithCredentials = async (credentials: LoginInput): Promise<AuthUser> => {
    const res = await authApi.login(credentials);
    setUser(res.user);
    syncManager.setActiveUser(res.user.id);
    syncManager.checkAndSync();
    return res.user;
  };

  const registerWithCredentials = async (data: RegisterInput): Promise<AuthUser> => {
    const res = await authApi.register(data);
    setUser(res.user);
    syncManager.setActiveUser(res.user.id);
    syncManager.checkAndSync();
    return res.user;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (e) {
      console.warn('[Logout Error]', e);
    } finally {
      setUser(null);
      syncManager.setActiveUser(null);
    }
  };

  const triggerSync = async () => {
    return syncManager.syncNow();
  };

  // Online only when both user toggle is online AND backend is reachable
  const effectiveOnline = manualOnline && syncState.isBackendReachable;

  return (
    <AppContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoadingUser,
        login,
        loginWithCredentials,
        registerWithCredentials,
        logout,
        isOnline: effectiveOnline,
        toggleOnline,
        syncState,
        triggerSync,
        notifications,
        toasts,
        showToast,
        removeToast,
        activeModal,
        setActiveModal,
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
