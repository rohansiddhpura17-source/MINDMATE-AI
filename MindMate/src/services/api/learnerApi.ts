import { apiClient } from './client';

export interface UserPreferences {
  adaptiveDifficulty: boolean;
  personalizedRecs: boolean;
  proactiveAI: boolean;
  learningInsights: boolean;
  cloudAI: boolean;
  learningStyle?: string;
  dailyGoalMinutes?: number;
}

export interface TopicProgressItem {
  id?: string;
  topicId: string;
  name: string;
  mastery: number;
  streak: number;
  attemptCount?: number;
  correctCount?: number;
  confidenceLevel?: string;
  confidenceScore?: number;
  confidenceDescription?: string;
  currentDifficulty?: string;
  status?: string;
  lastPracticed?: string;
}

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface AdaptiveQuestionItem {
  id: string;
  topicId: string;
  topicName: string;
  difficulty: DifficultyLevel;
  question: string;
  options: string[];
  explanation?: string;
}

export interface NextAdaptiveQuestionResponse {
  success: boolean;
  question: AdaptiveQuestionItem;
  selectionReason: string;
  targetDifficulty: DifficultyLevel;
  topicId: string;
  topicName: string;
}

export interface AdaptiveAnswerResult {
  isCorrect: boolean;
  correctOption: number;
  explanation: string;
  topicId: string;
  topicName: string;
  previousDifficulty: DifficultyLevel;
  newDifficulty: DifficultyLevel;
  transitionReason: string;
  difficultyChanged: boolean;
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  updatedMastery: {
    masteryScore: number;
    attemptCount: number;
    correctCount: number;
    confidenceLevel: string;
    confidenceScore: number;
    confidenceDescription: string;
  };
  nextQuestion:
    | {
        question: AdaptiveQuestionItem;
        selectionReason: string;
        targetDifficulty: DifficultyLevel;
      }
    | AdaptiveQuestionItem
    | null;
}

export interface AdaptiveDiagnosticTopic {
  topicId: string;
  topicName: string;
  masteryScore: number;
  attemptCount: number;
  correctCount: number;
  confidenceLevel: string;
  confidenceScore: number;
  confidenceDescription: string;
  currentDifficulty: DifficultyLevel;
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  status: string;
  lastPracticed: string | null;
}

export interface AdaptiveDiagnosticSummary {
  success: boolean;
  totalTopicsTracked: number;
  topics: AdaptiveDiagnosticTopic[];
  recommendedTopics: AdaptiveDiagnosticTopic[];
}

export interface StudyTaskItem {
  id: string;
  topicId: string;
  topicName: string;
  type: 'REVIEW' | 'PRACTICE' | 'QUIZ' | 'DOCUMENT_STUDY' | 'RECALL';
  title: string;
  estimatedMinutes: number;
  targetDifficulty: string;
  isCompleted: boolean;
  completedAt?: string | null;
  isPostponed: boolean;
  isOverdue: boolean;
  priorityScore: number;
  recommendationReason: string;
  actionUrl: string;
  source: string;
}

export interface DayPlanData {
  date: string;
  dayOfWeek: string;
  isToday: boolean;
  isTargetStudyDay: boolean;
  allocatedMinutes: number;
  dailyGoalMinutes: number;
  tasks: StudyTaskItem[];
}

export interface FullStudyPlan {
  success: boolean;
  lastUpdated: string;
  settings: {
    dailyGoalMinutes: number;
    preferredSessionMinutes: number;
    targetDays: string[];
    targetGoalDate: string | null;
    targetGoalName: string | null;
    priorityTopics: string[];
    reviewStrategy: string;
  };
  metrics: {
    totalActiveTopics: number;
    overdueReviewsCount: number;
    weeklyPlannedMinutes: number;
    todayCompletedMinutes: number;
    todayTotalMinutes: number;
  };
  prioritizedTopics: Array<{
    topicId: string;
    topicName: string;
    masteryScore: number;
    confidenceLevel: string;
    attemptCount: number;
    daysSincePractice: number;
    isOverdue: boolean;
    daysOverdue: number;
    totalPriorityScore: number;
    primaryRationale: string;
  }>;
  days: DayPlanData[];
}

export interface PlannerSettingsInput {
  dailyGoalMinutes?: number;
  preferredSessionMinutes?: number;
  targetDays?: string[];
  targetGoalDate?: string | null;
  targetGoalName?: string | null;
  priorityTopics?: string[];
  reviewStrategy?: 'BALANCED' | 'REVIEWS_FIRST' | 'KNOWLEDGE_GAP_FIRST';
}

export interface SpacedReviewItem {
  id: string;
  topicId: string;
  topicName: string;
  repetitionNumber: number;
  intervalDays: number;
  easeFactor: number;
  lastReviewedAt: string | null;
  nextReviewAt: string;
  lastOutcome: string | null;
  totalReviews: number;
  isOverdue: boolean;
  daysOverdue: number;
  urgencyScore: number;
}

export interface TopicTwinDetail {
  topicId: string;
  topicName: string;
  isAssessed: boolean;
  measuredObservations: {
    totalAttempts: number;
    correctCount: number;
    accuracyPct: number;
    lastPracticed: string | null;
    firstPracticed: string | null;
    streakDays: number;
    consecutiveCorrect: number;
    consecutiveIncorrect: number;
    totalQuizSessions: number;
  };
  modelEstimates: {
    masteryScore: number;
    confidenceLevel: 'INSUFFICIENT_EVIDENCE' | 'LOW' | 'MEDIUM' | 'HIGH';
    confidenceScore: number;
    status: 'CALIBRATING' | 'NEEDS_PRACTICE' | 'DEVELOPING' | 'PROFICIENT' | 'MASTERED';
    currentDifficulty: string;
    spacedIntervalDays: number | null;
    spacedEaseFactor: number | null;
    isSpacedRepetitionDue: boolean;
    daysOverdue: number;
    nextReviewAt: string | null;
  };
  trend: {
    direction: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'INSUFFICIENT_DATA';
    deltaScore: number;
    baselineScore: number | null;
    recentScore: number | null;
    sampleBaselineCount: number;
    sampleRecentCount: number;
    summary: string;
  };
  relevantMaterialsCount: number;
  materials: Array<{ id: string; name: string }>;
  recentQuizScores: Array<{ id: string; score: number; date: string }>;
  recommendedAction: {
    type: 'DIAGNOSTIC' | 'PRACTICE' | 'SPACED_REVIEW' | 'CHALLENGE' | 'MAINTAIN';
    title: string;
    rationale: string;
    actionUrl: string;
  };
}

export interface LearnerTwinOverview {
  totalActiveTopics: number;
  assessedTopicsCount: number;
  unassessedTopicsCount: number;
  overallMasteryPct: number;
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  overallAccuracyPct: number;
  demonstratedStrengthsCount: number;
  knowledgeGapsCount: number;
  uncalibratedTopicsCount: number;
  overdueReviewsCount: number;
  totalStudySessionsCompleted: number;
  lastCalibratedAt: string;
  confidenceDistribution: {
    insufficient: number;
    low: number;
    medium: number;
    high: number;
  };
}

export interface LearnerTwinProfile {
  userId: string;
  learnerName: string;
  learningGoal: string | null;
  overview: LearnerTwinOverview;
  topics: TopicTwinDetail[];
  strengths: TopicTwinDetail[];
  knowledgeGaps: TopicTwinDetail[];
  calibratingTopics: TopicTwinDetail[];
  unassessedTopics: TopicTwinDetail[];
  deterministicSummary: string;
}

export interface LearnerInsight {
  id: string;
  pattern:
    | 'REPEATED_MISTAKES'
    | 'KNOWLEDGE_GAP'
    | 'SUSTAINED_IMPROVEMENT'
    | 'PERFORMANCE_DECLINE'
    | 'OVERDUE_REVIEW'
    | 'RECENCY_DECAY'
    | 'CALIBRATION_NEEDED'
    | 'STRONG_FOUNDATION';
  type: 'mistake' | 'behavior' | 'mastery' | 'info';
  title: string;
  topicId: string;
  topicName: string;
  description: string;
  evidence: {
    attemptCount: number;
    correctCount: number;
    accuracyPct: number;
    timeframe: string;
    baselineAccuracy?: number;
    recentAccuracy?: number;
    scoreDelta?: number;
    daysOverdue?: number;
    daysInactive?: number;
    evidenceLevel: 'HIGH_CERTAINTY' | 'MODERATE' | 'PRELIMINARY_EVIDENCE' | 'INSUFFICIENT_DATA';
    sampleSufficiencyDescription: string;
  };
  pedagogicalRationale: string;
  recommendation: string;
  actionUrl: string;
  actionLabel: string;
  suggestedTaskType: 'PRACTICE' | 'REVIEW' | 'QUIZ' | 'DOCUMENT_STUDY';
  createdAt: string;
}

export interface InsightsResponse {
  success: boolean;
  userId: string;
  insights: LearnerInsight[];
  metrics: {
    totalInsights: number;
    urgentCount: number;
    gapsCount: number;
    improvementsCount: number;
    calibrationsCount: number;
  };
  emptyStateReason?: string;
  generatedAt: string;
}

export interface TwinSynthesisResult {
  source: 'AI_CLOUD' | 'DETERMINISTIC_ENGINE';
  model: string;
  summary: string;
  strengthsSummary: string;
  gapsSummary: string;
  recommendedFocus: string;
  generatedAt: string;
  evidenceGrounding: {
    totalAssessedTopics: number;
    totalQuestions: number;
    overallAccuracy: number;
    overdueReviewsCount: number;
    identifiedGapsCount: number;
  };
}

export interface ProgressSummary {
  success: boolean;
  overallMastery: number;
  maxStreak: number;
  topics: TopicProgressItem[];
}

export interface QuizAttemptRecord {
  id?: string;
  topicId: string;
  topicName: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  answers?: any[];
  createdAt?: string;
}

export interface MaterialSummary {
  overview: string;
  keyThemes: Array<{
    theme: string;
    description: string;
    pages: number[];
  }>;
  takeaways: Array<{
    text: string;
    page: number;
  }>;
}

export interface KeyConceptItem {
  concept: string;
  definition: string;
  pageNumber: number;
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  pageCitation: number;
}

export interface MaterialQuizQuestion {
  id: number;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  pageCitation: number;
}

export interface MaterialRecord {
  id: string;
  name: string;
  type: string;
  status: 'READY' | 'PROCESSING' | 'OCR_NEEDED' | 'FAILED' | 'processed' | string;
  errorMessage?: string;
  pages: number;
  fileSize?: number;
  chunksCount?: number;
  summary?: MaterialSummary;
  conceptsCount?: number;
  flashcardsCount?: number;
  keyConcepts?: KeyConceptItem[];
  flashcards?: FlashcardItem[];
  date: string;
  isOfflineCached?: boolean;
}

export const learnerApi = {
  async getPreferences(): Promise<UserPreferences> {
    const res = await apiClient<{ success: boolean; preferences: UserPreferences }>('/api/learner/preferences');
    return res.preferences;
  },

  async updatePreferences(preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    const res = await apiClient<{ success: boolean; preferences: UserPreferences }>('/api/learner/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
    return res.preferences;
  },

  async getProgress(): Promise<ProgressSummary> {
    return apiClient<ProgressSummary>('/api/learner/progress');
  },

  async updateProgress(data: {
    topicId: string;
    topicName: string;
    masteryScore: number;
    streakDays?: number;
    attemptDelta?: number;
    correctDelta?: number;
  }): Promise<any> {
    return apiClient('/api/learner/progress', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getQuizzes(): Promise<QuizAttemptRecord[]> {
    const res = await apiClient<{ success: boolean; quizzes: QuizAttemptRecord[] }>('/api/learner/quizzes');
    return res.quizzes;
  },

  async recordQuiz(attempt: {
    topicId: string;
    topicName: string;
    score: number;
    totalQuestions: number;
    correctAnswers: number;
    answers?: any[];
  }): Promise<{ success: boolean; quizAttempt: QuizAttemptRecord; updatedProgress: any }> {
    return apiClient('/api/learner/quizzes', {
      method: 'POST',
      body: JSON.stringify(attempt),
    });
  },

  /* ------------------------ Adaptive Learning Engine ----------------------- */
  async getNextAdaptiveQuestion(params?: {
    topicId?: string;
    difficulty?: DifficultyLevel;
    exclude?: string[];
  }): Promise<NextAdaptiveQuestionResponse> {
    const query = new URLSearchParams();
    if (params?.topicId) query.append('topicId', params.topicId);
    if (params?.difficulty) query.append('difficulty', params.difficulty);
    if (params?.exclude && params.exclude.length > 0) query.append('exclude', params.exclude.join(','));
    const url = `/api/learner/adaptive/next${query.toString() ? `?${query.toString()}` : ''}`;
    return apiClient<NextAdaptiveQuestionResponse>(url);
  },

  async submitAdaptiveAnswer(data: {
    questionId: string;
    selectedOption: number;
    clientEventId?: string;
    sessionExcludedIds?: string[];
  }): Promise<{ success: boolean; result: AdaptiveAnswerResult }> {
    return apiClient<{ success: boolean; result: AdaptiveAnswerResult }>('/api/learner/adaptive/answer', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getAdaptiveDiagnostic(): Promise<AdaptiveDiagnosticSummary> {
    return apiClient<AdaptiveDiagnosticSummary>('/api/learner/adaptive/diagnostic');
  },

  async seedAdaptiveQuestions(): Promise<{ success: boolean; totalQuestions: number }> {
    return apiClient<{ success: boolean; totalQuestions: number }>('/api/learner/adaptive/seed', {
      method: 'POST',
    });
  },

  /* ------------------- Study Planner & Spaced Repetition ------------------- */
  async getStudyPlan(): Promise<FullStudyPlan> {
    return apiClient<FullStudyPlan>('/api/learner/planner');
  },

  async regenerateStudyPlan(): Promise<FullStudyPlan> {
    return apiClient<FullStudyPlan>('/api/learner/planner/generate', {
      method: 'POST',
    });
  },

  async updatePlannerSettings(settings: PlannerSettingsInput): Promise<FullStudyPlan> {
    return apiClient<FullStudyPlan>('/api/learner/planner/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async completeStudyTask(taskId: string, isCompleted: boolean = true, scorePercentage?: number): Promise<{ success: boolean; task: StudyTaskItem; replanResult?: FullStudyPlan }> {
    return apiClient(`/api/learner/planner/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ isCompleted, scorePercentage }),
    });
  },

  async rescheduleStudyTask(taskId: string, newDate: string): Promise<{ success: boolean; task: StudyTaskItem }> {
    return apiClient(`/api/learner/planner/tasks/${taskId}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ newDate }),
    });
  },

  async getSpacedReviews(): Promise<{ success: boolean; totalTracked: number; overdueCount: number; reviews: SpacedReviewItem[] }> {
    return apiClient('/api/learner/spaced-repetition');
  },

  async recordSpacedReview(data: { topicId: string; topicName: string; outcome: 'PERFECT' | 'PASS' | 'PARTIAL' | 'FAIL' | 'CRITICAL_FAIL' }): Promise<any> {
    return apiClient('/api/learner/spaced-repetition/review', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getPlannerBaselineComparison(): Promise<any> {
    return apiClient('/api/learner/planner/baseline-comparison');
  },

  async getMaterials(): Promise<MaterialRecord[]> {
    const res = await apiClient<{ success: boolean; materials: MaterialRecord[] }>('/api/learner/materials');
    return res.materials;
  },

  async getMaterial(id: string): Promise<MaterialRecord> {
    const res = await apiClient<{ success: boolean; material: MaterialRecord }>(`/api/learner/materials/${id}`);
    return res.material;
  },

  async uploadMaterial(file: File): Promise<MaterialRecord> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient<{ success: boolean; material: MaterialRecord }>('/api/learner/materials/upload', {
      method: 'POST',
      body: formData,
    });
    return res.material;
  },

  async getMaterialChunks(id: string): Promise<Array<{ id: string; chunkIndex: number; pageNumber: number; content: string }>> {
    const res = await apiClient<{ success: boolean; chunks: Array<{ id: string; chunkIndex: number; pageNumber: number; content: string }> }>(
      `/api/learner/materials/${id}/chunks`
    );
    return res.chunks;
  },

  async queryMaterial(id: string, question: string): Promise<{ answer: string; citations: Array<{ pageNumber: number; chunkIndex: number; snippet: string }> }> {
    return apiClient(`/api/learner/materials/${id}/query`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  },

  async generateMaterialQuiz(id: string, count = 4): Promise<MaterialQuizQuestion[]> {
    const res = await apiClient<{ success: boolean; questions: MaterialQuizQuestion[] }>(`/api/learner/materials/${id}/quiz`, {
      method: 'POST',
      body: JSON.stringify({ count }),
    });
    return res.questions;
  },

  async createMaterial(material: {
    name: string;
    type: string;
    pages: number;
    status: string;
  }): Promise<MaterialRecord> {
    const res = await apiClient<{ success: boolean; material: MaterialRecord }>('/api/learner/materials', {
      method: 'POST',
      body: JSON.stringify(material),
    });
    return res.material;
  },

  async deleteMaterial(id: string | number): Promise<void> {
    await apiClient(`/api/learner/materials/${id}`, {
      method: 'DELETE',
    });
  },

  /* ---------------------- Milestone 7: Learning Twin & Insights ---------------------- */
  async getLearnerTwin(): Promise<{ success: boolean; profile: LearnerTwinProfile }> {
    return apiClient<{ success: boolean; profile: LearnerTwinProfile }>('/api/learner/twin');
  },

  async synthesizeTwin(allowCloudAi?: boolean): Promise<{ success: boolean; synthesis: TwinSynthesisResult }> {
    return apiClient<{ success: boolean; synthesis: TwinSynthesisResult }>('/api/learner/twin/synthesize', {
      method: 'POST',
      body: JSON.stringify({ allowCloudAi }),
    });
  },

  async getLearnerInsights(): Promise<InsightsResponse> {
    return apiClient<InsightsResponse>('/api/learner/insights');
  },

  async scheduleInsightTask(insightId: string, targetDate?: string): Promise<{ success: boolean; task: any; message: string }> {
    return apiClient(`/api/learner/insights/${insightId}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ targetDate }),
    });
  },
};
