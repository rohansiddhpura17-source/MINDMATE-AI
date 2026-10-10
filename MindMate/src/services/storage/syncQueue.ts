import { withStore, QueuedSyncEvent } from './db';

/**
 * Generate a cryptographically secure client event ID
 */
export function generateClientEventId(prefix = 'sync'): string {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${randomPart}`;
}

export const syncQueue = {
  /**
   * Enqueue a new operation for offline synchronization
   */
  async enqueue(
    userId: string,
    eventType: QueuedSyncEvent['eventType'],
    payload: any,
    customEventId?: string
  ): Promise<QueuedSyncEvent> {
    const event: QueuedSyncEvent = {
      eventId: customEventId || generateClientEventId(),
      userId,
      eventType,
      timestamp: new Date().toISOString(),
      payload,
      status: 'pending',
      retryCount: 0,
    };

    await withStore('sync_queue', 'readwrite', (store) => {
      store.put(event);
    });

    return event;
  },

  /**
   * Get all pending events strictly for a given user
   */
  async getPendingForUser(userId: string): Promise<QueuedSyncEvent[]> {
    return new Promise(async (resolve, reject) => {
      try {
        await withStore('sync_queue', 'readonly', (store) => {
          const index = store.index('userId');
          const request = index.getAll(userId);
          request.onsuccess = () => {
            const results = (request.result as QueuedSyncEvent[]) || [];
            // Filter only pending or failed events, sorted by timestamp
            const pending = results
              .filter((e) => e.status === 'pending' || e.status === 'failed')
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            resolve(pending);
          };
          request.onerror = () => reject(request.error);
        });
      } catch (err) {
        reject(err);
      }
    });
  },

  /**
   * Count total pending events across the database (or for a user)
   */
  async getPendingCount(userId?: string): Promise<number> {
    return new Promise(async (resolve, reject) => {
      try {
        await withStore('sync_queue', 'readonly', (store) => {
          if (userId) {
            const index = store.index('userId');
            const req = index.getAll(userId);
            req.onsuccess = () => {
              const pending = ((req.result as QueuedSyncEvent[]) || []).filter(
                (e) => e.status === 'pending' || e.status === 'failed'
              );
              resolve(pending.length);
            };
            req.onerror = () => reject(req.error);
          } else {
            const req = store.getAll();
            req.onsuccess = () => {
              const pending = ((req.result as QueuedSyncEvent[]) || []).filter(
                (e) => e.status === 'pending' || e.status === 'failed'
              );
              resolve(pending.length);
            };
            req.onerror = () => reject(req.error);
          }
        });
      } catch (err) {
        resolve(0);
      }
    });
  },

  /**
   * Update the status and retry count of a queued event
   */
  async updateStatus(
    eventId: string,
    status: QueuedSyncEvent['status'],
    errorMsg?: string
  ): Promise<void> {
    await withStore('sync_queue', 'readwrite', (store) => {
      const getReq = store.get(eventId);
      getReq.onsuccess = () => {
        const item = getReq.result as QueuedSyncEvent | undefined;
        if (item) {
          item.status = status;
          if (status === 'failed') {
            item.retryCount += 1;
            item.lastError = errorMsg;
          }
          store.put(item);
        }
      };
    });
  },

  /**
   * Remove successfully synchronized events
   */
  async remove(eventId: string): Promise<void> {
    await withStore('sync_queue', 'readwrite', (store) => {
      store.delete(eventId);
    });
  },

  /**
   * Remove all events for a specific user (e.g. user manually discards or logs out)
   */
  async clearForUser(userId: string): Promise<void> {
    const events = await this.getPendingForUser(userId);
    await withStore('sync_queue', 'readwrite', (store) => {
      for (const e of events) {
        store.delete(e.eventId);
      }
    });
  },
};
