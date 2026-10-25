export interface Learner {
  name: string;
  goal: string;
  streak: number;
  overallMastery: number;
  learningEfficiency: number;
  retention: number;
  weeklyLearning: string;
  recentAccuracy: number;
  preferredSession: string;
  learningStyle: string;
  strongest: string;
  weakest: string;
}

export interface Topic {
  name: string;
  mastery: number;
  status: 'mastered' | 'strong' | 'developing' | 'needs-work' | 'critical';
}

export interface WeeklyData {
  day: string;
  minutes: number;
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  topic: string;
}

export interface Friend {
  id: number;
  name: string;
  streak: number;
  subject: string;
  avatar: string;
  mastery: number;
}

export interface Material {
  id: number;
  name: string;
  type: string;
  status: string;
  pages: number;
  date: string;
}

export interface Insight {
  id: number;
  type: 'mistake' | 'behavior' | 'mastery';
  title: string;
  description: string;
  action: string;
  icon: string;
  color: 'success' | 'warning' | 'danger';
}

export interface Task {
  id?: string;
  user_id?: string;
  name: string;
  duration: string;
  type: string;
  completed?: boolean;
  priority?: 'low' | 'medium' | 'high';
  due_date?: string;
}

export interface PlannerDayData {
  day: string;
  tasks: Task[];
}

import type { VisualPayload } from '../services/visual/types';

export interface ChatMessage {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  promptContent?: string;
  code?: string;
  explanation?: string;
  source?: 'cloud' | 'local' | 'ollama' | 'deterministic-fallback' | 'mock-fallback';
  model?: string;
  timestamp?: number;
  elapsedMs?: number;
  loadDurationMs?: number;
  status?: 'preparing' | 'loading_model' | 'generating' | 'streaming' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  requestPrompt?: string;
  visual?: VisualPayload;
}
