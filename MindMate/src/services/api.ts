const BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000/api';

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('mindmate_token');
    return raw || null;
  } catch {
    return null;
  }
}

function saveToken(token: string) {
  localStorage.setItem('mindmate_token', token);
}

function clearToken() {
  localStorage.removeItem('mindmate_token');
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  goal?: string;
  learningTwin?: {
    overallMastery: number;
    streak: number;
    learningEfficiency: number;
    retention: number;
    weeklyMinutes: number;
    learningStyle: string;
    preferredSession: string;
    strongestTopic?: string;
    weakestTopic?: string;
  };
}

export interface AuthResponse {
  success: boolean;
  data: {
    token: string;
    user: AuthUser;
  };
}

export async function apiRegister(payload: {
  name: string;
  email: string;
  password: string;
  goal?: string;
}): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  saveToken(res.data.token);
  return res;
}

export async function apiLogin(payload: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  saveToken(res.data.token);
  return res;
}

export async function apiGetMe(): Promise<{ success: boolean; data: { user: AuthUser } }> {
  return request('/auth/me');
}

export function apiLogout() {
  clearToken();
  localStorage.removeItem('mindmate_user');
}

// ─── Topics ──────────────────────────────────────────────────────────────────

export interface Topic {
  id: string;
  name: string;
  mastery: number;
  status: string;
  subject: string;
}

export async function apiGetTopics(): Promise<{ success: boolean; data: { topics: Topic[] } }> {
  return request('/topics');
}

export async function apiUpdateTopic(
  id: string,
  mastery: number
): Promise<{ success: boolean; data: { topic: Topic } }> {
  return request(`/topics/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ mastery }),
  });
}

// ─── Learning Twin ────────────────────────────────────────────────────────────

export async function apiGetLearningTwin(): Promise<{ success: boolean; data: any }> {
  return request('/learning-twin');
}

export async function apiUpdatePreferences(payload: {
  learningStyle?: string;
  preferredSession?: string;
}): Promise<{ success: boolean; data: any }> {
  return request('/learning-twin/preferences', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  topic?: string;
  createdAt: string;
}

export async function apiSendMessage(payload: {
  content: string;
  topic?: string;
}): Promise<{ success: boolean; data: { userMessage: Partial<ChatMessage>; botMessage: ChatMessage } }> {
  return request('/chat/message', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiGetChatHistory(): Promise<{ success: boolean; data: { messages: ChatMessage[] } }> {
  return request('/chat/history');
}

export async function apiClearChatHistory(): Promise<{ success: boolean }> {
  return request('/chat/history', { method: 'DELETE' });
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

export async function apiStartQuizSession(topic: string): Promise<{ success: boolean; data: { sessionId: string } }> {
  return request('/quiz/session', {
    method: 'POST',
    body: JSON.stringify({ topic }),
  });
}

export async function apiSubmitAnswer(
  sessionId: string,
  payload: {
    question: string;
    selectedOption: number;
    correctOption: number;
    isCorrect: boolean;
    topic: string;
  }
): Promise<{ success: boolean }> {
  return request(`/quiz/session/${sessionId}/answer`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiCompleteQuizSession(
  sessionId: string,
  payload: { score: number; total: number; mainGap?: string }
): Promise<{ success: boolean }> {
  return request(`/quiz/session/${sessionId}/complete`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function apiGetQuizHistory(): Promise<{ success: boolean; data: { sessions: any[] } }> {
  return request('/quiz/history');
}

// ─── Materials ────────────────────────────────────────────────────────────────

export async function apiUploadMaterial(payload: {
  name: string;
  type: string;
  content: string;
}): Promise<{ success: boolean; data: { material: any } }> {
  return request('/materials', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiGetMaterials(): Promise<{ success: boolean; data: { materials: any[] } }> {
  return request('/materials');
}

export async function apiGetMaterial(id: string): Promise<{ success: boolean; data: { material: any } }> {
  return request(`/materials/${id}`);
}

export async function apiDeleteMaterial(id: string): Promise<{ success: boolean }> {
  return request(`/materials/${id}`, { method: 'DELETE' });
}

// ─── Planner ──────────────────────────────────────────────────────────────────

export async function apiGetPlanner(): Promise<{ success: boolean; data: { tasks: any[] } }> {
  return request('/planner');
}

export async function apiUpdatePlannerTask(
  id: string,
  completed: boolean
): Promise<{ success: boolean }> {
  return request(`/planner/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ completed }),
  });
}

export async function apiRegeneratePlan(): Promise<{ success: boolean; data: { tasks: any[] } }> {
  return request('/planner/regenerate', { method: 'POST' });
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export async function apiGetInsights(): Promise<{ success: boolean; data: { insights: any[] } }> {
  return request('/insights');
}

export async function apiMarkInsightRead(id: string): Promise<{ success: boolean }> {
  return request(`/insights/${id}/read`, { method: 'PUT' });
}

// ─── Friends ──────────────────────────────────────────────────────────────────

export async function apiGetFriends(): Promise<{ success: boolean; data: { friends: any[] } }> {
  return request('/friends');
}

export async function apiSendFriendRequest(friendEmail: string): Promise<{ success: boolean }> {
  return request('/friends/request', {
    method: 'POST',
    body: JSON.stringify({ friendEmail }),
  });
}
