import { apiClient, ApiError } from '../api/client';
import { syncQueue } from './syncQueue';
import { withStore } from './db';
import {
  saveQuizSession,
  updateProfile,
  updatePlannerTask,
  completePlannerTaskActivity,
  recordStudyActivity,
} from '../../lib/db';

export interface SyncStatusState {
  isBackendReachable: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: Date | null;
  error: string | null;
  activeUserId: string | null;
}

type SyncListener = (state: SyncStatusState) => void;

class SyncManager {
  private listeners: Set<SyncListener> = new Set();
  private state: SyncStatusState = {
    isBackendReachable: true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    error: null,
    activeUserId: null,
  };
  private pollTimer: any = null;
  private maxRetries = 5;

  constructor() {
    // Listen to browser network events to proactively trigger reachability check
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.checkAndSync());
      window.addEventListener('offline', () => {
        this.updateState({ isBackendReachable: false });
      });
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener({ ...this.state });
    }
  }

  private updateState(partial: Partial<SyncStatusState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  public setActiveUser(userId: string | null) {
    this.updateState({ activeUserId: userId });
    this.refreshPendingCount();
  }

  public async refreshPendingCount(): Promise<number> {
    const count = await syncQueue.getPendingCount(this.state.activeUserId || undefined);
    this.updateState({ pendingCount: count });
    return count;
  }

  /**
   * Genuine healthcheck ping to verify backend is actually reachable
   */
  public async checkBackendReachability(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch('/api/health', {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const reachable = res.ok;
      this.updateState({ isBackendReachable: reachable });
      return reachable;
    } catch {
      this.updateState({ isBackendReachable: false });
      return false;
    }
  }

  /**
   * Main synchronization execution
   */
  public async syncNow(): Promise<{ syncedCount: number; conflicts: any[]; error?: string }> {
    const userId = this.state.activeUserId;
    if (!userId) {
      return { syncedCount: 0, conflicts: [], error: 'No active user authenticated' };
    }

    if (this.state.isSyncing) {
      return { syncedCount: 0, conflicts: [] };
    }

    // 1. Check real backend reachability
    const isReachable = await this.checkBackendReachability();
    if (!isReachable) {
      return { syncedCount: 0, conflicts: [], error: 'Backend unreachable' };
    }

    // 2. Validate current session and verify active user identity on server
    let serverUser: { userId: string } | null = null;
    try {
      const statusRes = await apiClient<{ success: boolean; userId: string }>('/api/learner/sync/status');
      if (statusRes.success) {
        serverUser = statusRes;
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        this.updateState({
          error: 'Session expired. Please log in again to synchronize your offline progress.',
        });
        return { syncedCount: 0, conflicts: [], error: 'Session expired' };
      }
      return { syncedCount: 0, conflicts: [], error: err.message };
    }

    if (!serverUser || serverUser.userId !== userId) {
      this.updateState({
        error: 'Account mismatch: server authenticated as a different account.',
      });
      return { syncedCount: 0, conflicts: [], error: 'Account mismatch' };
    }

    // 3. Retrieve pending events strictly for this user
    const pendingEvents = await syncQueue.getPendingForUser(userId);
    if (pendingEvents.length === 0) {
      this.updateState({ pendingCount: 0, error: null });
      return { syncedCount: 0, conflicts: [] };
    }

    this.updateState({ isSyncing: true, error: null });

    try {
      let processedEventIds: string[] = [];

      // Try server API first if reachable
      try {
        const response = await apiClient<{
          success: boolean;
          processedEventIds: string[];
          conflicts: any[];
          serverState: any;
        }>('/api/learner/sync', {
          method: 'POST',
          body: JSON.stringify({ events: pendingEvents }),
        });
        if (response?.success && Array.isArray(response.processedEventIds)) {
          processedEventIds = response.processedEventIds;
        }
      } catch (apiErr) {
        // Fall back to direct Supabase sync
        for (const evt of pendingEvents) {
          try {
            if (evt.eventType === 'QUIZ_ATTEMPT') {
              const accuracy = evt.payload.totalQuestions > 0
                ? Math.round((evt.payload.correctAnswers / evt.payload.totalQuestions) * 100)
                : 100;
              await saveQuizSession(userId, {
                topic: evt.payload.topicName || 'General',
                score: evt.payload.score || 0,
                total: evt.payload.totalQuestions || 0,
                accuracy,
              });
            } else if (evt.eventType === 'PREFERENCES_UPDATE') {
              await updateProfile(userId, evt.payload);
            } else if (evt.eventType === 'STUDY_TASK_COMPLETE') {
              if (evt.payload.taskId) {
                await updatePlannerTask(evt.payload.taskId, true);
                await completePlannerTaskActivity(evt.payload.taskId, userId);
              }
            } else if (evt.eventType === 'STUDY_ACTIVITY') {
              await recordStudyActivity(
                userId,
                evt.payload.topicName || 'General',
                evt.payload.minutes || 15,
                evt.payload.activityType || 'quiz'
              );
            }
            processedEventIds.push(evt.eventId);
          } catch (itemErr) {
            console.warn('[Sync Item Error]', evt.eventId, itemErr);
          }
        }
      }

      const processedSet = new Set(processedEventIds);

      // Acknowledge processed events
      for (const evt of pendingEvents) {
        if (processedSet.has(evt.eventId)) {
          await syncQueue.remove(evt.eventId);

          // Mark quiz attempt as synced in local IndexedDB
          if (evt.eventType === 'QUIZ_ATTEMPT') {
            await withStore('quiz_attempts', 'readwrite', (store) => {
              const req = store.get(evt.eventId);
              req.onsuccess = () => {
                if (req.result) {
                  req.result.synced = true;
                  store.put(req.result);
                }
              };
            });
          }
        } else {
          await syncQueue.updateStatus(
            evt.eventId,
            'failed',
            'Event could not be synchronized'
          );
        }
      }

      const remaining = await syncQueue.getPendingCount(userId);
      this.updateState({
        isSyncing: false,
        pendingCount: remaining,
        lastSyncTime: new Date(),
        error: null,
      });

      return {
        syncedCount: processedEventIds.length,
        conflicts: [],
      };
    } catch (err: any) {
      console.warn('[Sync Error]', err);
      for (const evt of pendingEvents) {
        const nextRetry = evt.retryCount + 1;
        const msg = nextRetry >= this.maxRetries ? 'Max retries exceeded' : err?.message || 'Sync failed';
        await syncQueue.updateStatus(evt.eventId, 'failed', msg);
      }

      const remaining = await syncQueue.getPendingCount(userId);
      this.updateState({
        isSyncing: false,
        pendingCount: remaining,
        error: err?.message || 'Sync failed. Will retry automatically.',
      });

      return {
        syncedCount: 0,
        conflicts: [],
        error: err?.message || 'Sync failed',
      };
    }
  }

  public async checkAndSync() {
    const isReachable = await this.checkBackendReachability();
    if (isReachable && this.state.activeUserId) {
      await this.syncNow();
    }
  }

  public startPeriodicSync(intervalMs = 30000) {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.checkAndSync();
    }, intervalMs);
  }

  public stopPeriodicSync() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

export const syncManager = new SyncManager();
