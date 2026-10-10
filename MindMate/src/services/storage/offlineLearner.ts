import { withStore, OfflineProgressItem, OfflineQuizAttempt, OfflinePreferences } from './db';
import { syncQueue, generateClientEventId } from './syncQueue';

export const offlineLearner = {
  /* -------------------------------- Quizzes -------------------------------- */
  async saveQuizAttemptOffline(
    userId: string,
    attempt: {
      topicId: string;
      topicName: string;
      score: number;
      totalQuestions: number;
      correctAnswers: number;
      answers?: any[];
    }
  ): Promise<OfflineQuizAttempt> {
    const clientEventId = generateClientEventId('quiz');
    const offlineRecord: OfflineQuizAttempt = {
      clientEventId,
      userId,
      topicId: attempt.topicId,
      topicName: attempt.topicName,
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      correctAnswers: attempt.correctAnswers,
      answers: attempt.answers || [],
      createdAt: new Date().toISOString(),
      synced: false,
    };

    // Save into local IndexedDB quiz attempts store
    await withStore('quiz_attempts', 'readwrite', (store) => {
      store.put(offlineRecord);
    });

    // Also update local progress immediately so the offline learner sees their updated mastery score!
    const percentageScore = (attempt.correctAnswers / attempt.totalQuestions) * 100;
    await this.updateProgressOffline(userId, {
      topicId: attempt.topicId,
      topicName: attempt.topicName,
      masteryScore: percentageScore,
      streakDelta: percentageScore >= 60 ? 1 : 0,
      attemptDelta: attempt.totalQuestions,
      correctDelta: attempt.correctAnswers,
    });

    // Enqueue for backend synchronization
    await syncQueue.enqueue(
      userId,
      'QUIZ_ATTEMPT',
      {
        clientEventId,
        topicId: attempt.topicId,
        topicName: attempt.topicName,
        score: attempt.score,
        totalQuestions: attempt.totalQuestions,
        correctAnswers: attempt.correctAnswers,
        answers: attempt.answers,
      },
      clientEventId
    );

    return offlineRecord;
  },

  async getLocalQuizAttempts(userId: string): Promise<OfflineQuizAttempt[]> {
    return new Promise(async (resolve, reject) => {
      try {
        await withStore('quiz_attempts', 'readonly', (store) => {
          const index = store.index('userId');
          const req = index.getAll(userId);
          req.onsuccess = () => {
            const list = (req.result as OfflineQuizAttempt[]) || [];
            list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            resolve(list);
          };
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        resolve([]);
      }
    });
  },

  /* -------------------------------- Progress ------------------------------- */
  async updateProgressOffline(
    userId: string,
    update: {
      topicId: string;
      topicName: string;
      masteryScore: number;
      streakDelta?: number;
      attemptDelta?: number;
      correctDelta?: number;
    }
  ): Promise<OfflineProgressItem> {
    const key = `${userId}:${update.topicId}`;
    let existing = await this.getProgressItem(userId, update.topicId);

    const newMastery = existing
      ? Math.round(existing.masteryScore * 0.7 + update.masteryScore * 0.3)
      : Math.round(update.masteryScore);

    const record: OfflineProgressItem = {
      key,
      userId,
      topicId: update.topicId,
      topicName: update.topicName,
      masteryScore: newMastery,
      streakDays: (existing?.streakDays ?? 0) + (update.streakDelta ?? 0),
      attemptCount: (existing?.attemptCount ?? 0) + (update.attemptDelta ?? 1),
      correctCount: (existing?.correctCount ?? 0) + (update.correctDelta ?? 1),
      lastPracticed: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      synced: false,
    };

    await withStore('learner_progress', 'readwrite', (store) => {
      store.put(record);
    });

    // Enqueue event
    await syncQueue.enqueue(userId, 'PROGRESS_UPDATE', {
      topicId: update.topicId,
      topicName: update.topicName,
      masteryScore: record.masteryScore,
      streakDays: record.streakDays,
      attemptDelta: update.attemptDelta,
      correctDelta: update.correctDelta,
    });

    return record;
  },

  async getProgressItem(userId: string, topicId: string): Promise<OfflineProgressItem | null> {
    const key = `${userId}:${topicId}`;
    return new Promise(async (resolve) => {
      try {
        await withStore('learner_progress', 'readonly', (store) => {
          const req = store.get(key);
          req.onsuccess = () => resolve((req.result as OfflineProgressItem) || null);
          req.onerror = () => resolve(null);
        });
      } catch {
        resolve(null);
      }
    });
  },

  async getAllProgressOffline(userId: string): Promise<OfflineProgressItem[]> {
    return new Promise(async (resolve) => {
      try {
        await withStore('learner_progress', 'readonly', (store) => {
          const index = store.index('userId');
          const req = index.getAll(userId);
          req.onsuccess = () => resolve((req.result as OfflineProgressItem[]) || []);
          req.onerror = () => resolve([]);
        });
      } catch {
        resolve([]);
      }
    });
  },

  async cacheServerProgress(userId: string, serverTopics: any[]): Promise<void> {
    await withStore('learner_progress', 'readwrite', (store) => {
      for (const t of serverTopics) {
        const item: OfflineProgressItem = {
          key: `${userId}:${t.topicId}`,
          userId,
          topicId: t.topicId,
          topicName: t.name || t.topicName,
          masteryScore: t.mastery ?? t.masteryScore ?? 0,
          streakDays: t.streak ?? t.streakDays ?? 0,
          attemptCount: t.attemptCount || 0,
          correctCount: t.correctCount || 0,
          confidenceLevel: t.confidenceLevel,
          confidenceScore: t.confidenceScore,
          confidenceDescription: t.confidenceDescription,
          currentDifficulty: t.currentDifficulty,
          lastPracticed: t.lastPracticed || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          synced: true,
        };
        store.put(item);
      }
    });
  },

  /* ------------------------------- Preferences ------------------------------ */
  async savePreferencesOffline(userId: string, preferences: Record<string, any>): Promise<void> {
    const record: OfflinePreferences = {
      userId,
      preferences,
      updatedAt: new Date().toISOString(),
      synced: false,
    };

    await withStore('user_preferences', 'readwrite', (store) => {
      store.put(record);
    });

    await syncQueue.enqueue(userId, 'PREFERENCES_UPDATE', preferences);
  },

  async getPreferencesOffline(userId: string): Promise<Record<string, any> | null> {
    return new Promise(async (resolve) => {
      try {
        await withStore('user_preferences', 'readonly', (store) => {
          const req = store.get(userId);
          req.onsuccess = () => resolve(req.result?.preferences || null);
          req.onerror = () => resolve(null);
        });
      } catch {
        resolve(null);
      }
    });
  },

  async cacheServerPreferences(userId: string, preferences: Record<string, any>): Promise<void> {
    const record: OfflinePreferences = {
      userId,
      preferences,
      updatedAt: new Date().toISOString(),
      synced: true,
    };
    await withStore('user_preferences', 'readwrite', (store) => {
      store.put(record);
    });
  },

  /* ----------------------------- Content Caching ---------------------------- */
  async cacheLearningContent(id: string, data: any): Promise<void> {
    await withStore('learning_content', 'readwrite', (store) => {
      store.put({ id, data, cachedAt: new Date().toISOString() });
    });
  },

  async getCachedLearningContent(id: string): Promise<any | null> {
    return new Promise(async (resolve) => {
      try {
        await withStore('learning_content', 'readonly', (store) => {
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result?.data || null);
          req.onerror = () => resolve(null);
        });
      } catch {
        resolve(null);
      }
    });
  },

  async cacheMaterial(userId: string, material: any): Promise<void> {
    await this.cacheLearningContent(`material:${material.id}`, material);
    const existingList = (await this.getCachedLearningContent(`materials:${userId}`)) || [];
    const filtered = existingList.filter((m: any) => m.id !== material.id);
    await this.cacheLearningContent(`materials:${userId}`, [material, ...filtered]);
  },

  async getCachedMaterials(userId: string): Promise<any[]> {
    return (await this.getCachedLearningContent(`materials:${userId}`)) || [];
  },

  async getCachedMaterial(materialId: string): Promise<any | null> {
    return this.getCachedLearningContent(`material:${materialId}`);
  },

  async cacheMaterialChunks(materialId: string, chunks: any[]): Promise<void> {
    await this.cacheLearningContent(`chunks:${materialId}`, chunks);
  },

  async getCachedMaterialChunks(materialId: string): Promise<any[]> {
    return (await this.getCachedLearningContent(`chunks:${materialId}`)) || [];
  },

  /* ------------------------------ Study Planner ----------------------------- */
  async cacheStudyPlan(userId: string, plan: any): Promise<void> {
    await this.cacheLearningContent(`study_plan:${userId}`, plan);
  },

  async getCachedStudyPlan(userId: string): Promise<any | null> {
    return this.getCachedLearningContent(`study_plan:${userId}`);
  },

  async completeStudyTaskOffline(userId: string, taskId: string): Promise<void> {
    const cachedPlan = await this.getCachedStudyPlan(userId);
    if (cachedPlan && cachedPlan.days) {
      for (const d of cachedPlan.days) {
        for (const t of d.tasks) {
          if (t.id === taskId) {
            t.isCompleted = true;
            t.completedAt = new Date().toISOString();
          }
        }
      }
      await this.cacheStudyPlan(userId, cachedPlan);
    }

    // Queue for server synchronization
    await syncQueue.enqueue(userId, 'STUDY_TASK_COMPLETE', { taskId });
  },

  /* ---------------------- Milestone 7: Learning Twin & Insights ---------------------- */
  async cacheTwinProfile(userId: string, profile: any): Promise<void> {
    await this.cacheLearningContent(`twin:${userId}`, profile);
  },

  async getCachedTwinProfile(userId: string): Promise<any | null> {
    return this.getCachedLearningContent(`twin:${userId}`);
  },

  async cacheInsights(userId: string, insights: any): Promise<void> {
    await this.cacheLearningContent(`insights:${userId}`, insights);
  },

  async getCachedInsights(userId: string): Promise<any | null> {
    return this.getCachedLearningContent(`insights:${userId}`);
  },
};
