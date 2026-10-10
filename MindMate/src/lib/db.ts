/**
 * MindMate - Local SQLite / Backend Database Client
 * 
 * Drop-in local replacement for the friend's Supabase database client.
 * Connects directly to the local backend endpoints (/api/db/...) backed by
 * our local SQLite database. Works 100% offline without remote cloud dependency.
 */

// Helper fetcher with credentials
async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

// -------------------------------------------------------------
// 1. PROFILES
// -------------------------------------------------------------
export async function getProfile(userId: string) {
  try {
    const json = await fetchApi(`/api/db/profiles/${userId}`);
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

export async function updateProfile(userId: string, data: Partial<{
  name: string; goal: string; learning_style: string; preferred_session: string;
}>) {
  try {
    const json = await fetchApi(`/api/db/profiles/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return { data: json, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

// -------------------------------------------------------------
// 2. TOPICS
// -------------------------------------------------------------
export async function getTopics(_userId?: string) {
  try {
    const json = await fetchApi('/api/db/topics');
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: [], error };
  }
}

export async function updateTopicMastery(id: string, mastery: number) {
  try {
    const json = await fetchApi(`/api/db/topics/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ mastery }),
    });
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

// -------------------------------------------------------------
// 3. CHAT MESSAGES
// -------------------------------------------------------------
export async function getChatHistory(_userId?: string, limit = 20) {
  try {
    const json = await fetchApi(`/api/db/chat?limit=${limit}`);
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: [], error };
  }
}

export async function saveChatMessage(_userId: string, role: string, content: string, topic?: string) {
  try {
    const json = await fetchApi('/api/db/chat', {
      method: 'POST',
      body: JSON.stringify({ role, content, topic }),
    });
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

// -------------------------------------------------------------
// 4. QUIZ SESSIONS
// -------------------------------------------------------------
export async function saveQuizSession(_userId: string, data: { topic: string; score: number; total: number; accuracy: number; main_gap?: string }) {
  try {
    const json = await fetchApi('/api/db/quiz', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

export async function getQuizHistory(_userId?: string) {
  try {
    const json = await fetchApi('/api/db/quiz');
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: [], error };
  }
}

// -------------------------------------------------------------
// 5. PLANNER TASKS
// -------------------------------------------------------------
export async function getPlannerTasks(_userId?: string) {
  try {
    const json = await fetchApi('/api/db/planner');
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: [], error };
  }
}

export async function updatePlannerTask(id: string, completed: boolean) {
  try {
    const json = await fetchApi(`/api/db/planner/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed }),
    });
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

// -------------------------------------------------------------
// 6. MATERIALS
// -------------------------------------------------------------
export async function getMaterials(_userId?: string) {
  try {
    const json = await fetchApi('/api/db/materials');
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: [], error };
  }
}

export async function saveMaterial(_userId: string, data: { name: string; type: string; raw_content: string; summary?: string; key_concepts?: string }) {
  try {
    const json = await fetchApi('/api/db/materials', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

export async function deleteMaterial(id: string) {
  try {
    const json = await fetchApi(`/api/db/materials/${id}`, {
      method: 'DELETE',
    });
    return { data: json, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

// -------------------------------------------------------------
// 7. INSIGHTS
// -------------------------------------------------------------
export async function getInsights(_userId?: string) {
  try {
    const json = await fetchApi('/api/db/insights');
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: [], error };
  }
}

export async function markInsightRead(id: string) {
  try {
    const json = await fetchApi(`/api/db/insights/${id}`, {
      method: 'PATCH',
    });
    return { data: json.data, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}
