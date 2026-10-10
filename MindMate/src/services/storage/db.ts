// MindMate IndexedDB Storage Layer
// Provides reliable, structured client-side storage for offline-first learning

const DB_NAME = 'mindmate_offline_db';
const DB_VERSION = 2;

export interface OfflineProgressItem {
  key: string; // `${userId}:${topicId}`
  userId: string;
  topicId: string;
  topicName: string;
  masteryScore: number;
  streakDays: number;
  attemptCount: number;
  correctCount: number;
  confidenceLevel?: string;
  confidenceScore?: number;
  confidenceDescription?: string;
  currentDifficulty?: string;
  lastPracticed: string;
  updatedAt: string;
  synced: boolean;
}

export interface OfflineQuizAttempt {
  clientEventId: string;
  userId: string;
  topicId: string;
  topicName: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  answers: any[];
  createdAt: string;
  synced: boolean;
}

export interface OfflinePreferences {
  userId: string;
  preferences: Record<string, any>;
  updatedAt: string;
  synced: boolean;
}

export interface QueuedSyncEvent {
  eventId: string;
  userId: string;
  eventType: 'QUIZ_ATTEMPT' | 'PROGRESS_UPDATE' | 'PREFERENCES_UPDATE' | 'MATERIAL_CREATE' | 'STUDY_TASK_COMPLETE' | 'STUDY_ACTIVITY';
  timestamp: string;
  payload: any;
  status: 'pending' | 'syncing' | 'failed' | 'synced';
  retryCount: number;
  lastError?: string;
}

let dbInstance: IDBDatabase | null = null;

export function openOfflineDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Object store for sync queue
      if (!db.objectStoreNames.contains('sync_queue')) {
        const queueStore = db.createObjectStore('sync_queue', { keyPath: 'eventId' });
        queueStore.createIndex('userId', 'userId', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Object store for learner progress cache
      if (!db.objectStoreNames.contains('learner_progress')) {
        const progressStore = db.createObjectStore('learner_progress', { keyPath: 'key' });
        progressStore.createIndex('userId', 'userId', { unique: false });
        progressStore.createIndex('topicId', 'topicId', { unique: false });
      }

      // Object store for offline quiz attempts
      if (!db.objectStoreNames.contains('quiz_attempts')) {
        const quizStore = db.createObjectStore('quiz_attempts', { keyPath: 'clientEventId' });
        quizStore.createIndex('userId', 'userId', { unique: false });
        quizStore.createIndex('topicId', 'topicId', { unique: false });
        quizStore.createIndex('synced', 'synced', { unique: false });
      }

      // Object store for preferences cache
      if (!db.objectStoreNames.contains('user_preferences')) {
        db.createObjectStore('user_preferences', { keyPath: 'userId' });
      }

      // Object store for offline learning content cache (topics, materials)
      if (!db.objectStoreNames.contains('learning_content')) {
        db.createObjectStore('learning_content', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Generic helper to execute a transaction
 */
export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openOfflineDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    let result: any;
    try {
      result = callback(store);
    } catch (err) {
      reject(err);
      return;
    }

    tx.oncomplete = () => {
      resolve(result);
    };

    tx.onerror = () => {
      reject(tx.error);
    };

    tx.onabort = () => {
      reject(new Error(`Transaction aborted on store ${storeName}`));
    };
  });
}
