export type AttemptType = 'diagnostic' | 'follow_up' | 'adaptive' | 'mistake_review';

export type PersistenceStatus =
  | 'idle'
  | 'saving'
  | 'saved_cloud'
  | 'saved_local_only'
  | 'failed';

export type ConfidenceLevel = 'none' | 'insufficient' | 'low' | 'medium' | 'high';

export type MasteryStatus =
  | 'unassessed'
  | 'weak'
  | 'developing'
  | 'strong'
  | 'mastered';

export type DifficultyBand = 'easy' | 'medium' | 'hard';

export type ExplanationStrategy =
  | 'step-by-step'
  | 'simple-analogy'
  | 'worked-example'
  | 'conceptual-recap'
  | 'prerequisite-review'
  | 'guided-practice';

export type SuggestedActivityType =
  | 'diagnostic-quiz'
  | 'follow-up-quiz'
  | 'targeted-practice'
  | 'prerequisite-review'
  | 'concept-explanation'
  | 'advance-difficulty';

export interface AttemptRecord {
  id: string;
  client_attempt_id: string;
  user_id: string;
  quiz_id: string;
  attempt_type: AttemptType;
  session_id: string;
  subject_id: string;
  topic_id: string;
  topic_name: string;
  concept_tag?: string;
  question_id: string;
  question_text: string;
  options: string[];
  selected_option: number;
  correct_option: number;
  is_correct: boolean;
  difficulty: number;
  explanation: string;
  response_duration_ms?: number;
  resolved: boolean;
  attempted_at: string;
  persistence_source?: 'cloud' | 'local';
}

export interface DifficultyPerformance {
  attempts: number;
  correct: number;
  accuracy: number | null;
}

export interface TopicMasteryMetrics {
  topicId: string;
  topicName: string;
  subjectId: string;
  totalAttempts: number;
  correctAnswers: number;
  incorrectAnswers: number;
  overallAccuracy: number;
  recentAccuracy: number;
  recentWindowSize: number;
  difficultyPerformance: {
    easy: DifficultyPerformance;
    medium: DifficultyPerformance;
    hard: DifficultyPerformance;
  };
  recurringMistakesCount: number;
  unresolvedMistakesCount: number;
  lastPracticedAt: string | null;
  masteryScore: number;
  status: MasteryStatus;
  evidenceCount: number;
  confidenceLevel: ConfidenceLevel;
  formulaSummary: string;
}

export interface RecurringMistakePattern {
  id: string;
  topicId: string;
  topicName: string;
  conceptTag: string | null;
  patternType:
    | 'repeated_concept_error'
    | 'repeated_question_error'
    | 'repeated_distractor'
    | 'prerequisite_difficulty'
    | 'topic_error_summary';
  isConfirmedPattern: boolean;
  occurrences: number;
  unresolvedCount: number;
  questionIds: string[];
  summary: string;
  evidenceDetail: string;
  suggestedStrategy: ExplanationStrategy;
  lastOccurredAt: string;
}

export interface RecommendationEvidence {
  totalAttempts: number;
  accuracy: number;
  recentAccuracy: number;
  masteryScore: number;
  confidenceLevel: ConfidenceLevel;
  recurringMistakes: number;
  prerequisiteTopicId?: string;
  prerequisiteTopicName?: string;
  prerequisiteMastery?: number;
  detail: string;
}

export interface EvidenceRecommendation {
  id: string;
  action: SuggestedActivityType;
  topicId: string;
  topicName: string;
  subjectId: string;
  reason: string;
  supportingEvidence: RecommendationEvidence;
  suggestedDifficulty: DifficultyBand;
  suggestedDifficultyLevel: number;
  explanationStrategy: ExplanationStrategy;
  priority: number;
  createdAt: string;
}

export interface NextLearningAction {
  nextTopicId: string;
  nextTopicName: string;
  subjectId: string;
  suggestedDifficulty: DifficultyBand;
  suggestedDifficultyLevel: number;
  explanationStrategy: ExplanationStrategy;
  strategyReason: string;
  includeWorkedExample: boolean;
  prerequisiteReview: {
    required: boolean;
    prerequisiteTopicId?: string;
    prerequisiteTopicName?: string;
    reason?: string;
  };
  suggestedActivity: SuggestedActivityType;
  reason: string;
  supportingEvidence: RecommendationEvidence;
  confidenceLevel: ConfidenceLevel;
}

export interface SessionAdaptationDelta {
  topicId: string;
  topicName: string;
  previousMastery: number;
  newMastery: number;
  masteryDelta: number;
  previousConfidence: ConfidenceLevel;
  newConfidence: ConfidenceLevel;
  previousDifficulty: number;
  nextSuggestedDifficulty: number;
  selectedStrategy: ExplanationStrategy;
  strategyReason: string;
  nextAction: NextLearningAction;
  persistenceStatus: PersistenceStatus;
  persistenceMessage: string;
}

export interface LearnerAnalyticsSnapshot {
  userId: string | null;
  isSupabaseConfigured: boolean;
  dataSource: 'cloud_and_local' | 'local_only' | 'unauthenticated';
  syncError: string | null;
  totalAttempts: number;
  totalCorrect: number;
  overallAccuracy: number;
  recentAccuracy: number;
  averageMastery: number;
  assessedTopicsCount: number;
  totalTopicsCount: number;
  topics: TopicMasteryMetrics[];
  mistakePatterns: RecurringMistakePattern[];
  recommendations: EvidenceRecommendation[];
  nextLearningAction: NextLearningAction;
  recentAttempts: AttemptRecord[];
  lastUpdatedAt: string;
}
