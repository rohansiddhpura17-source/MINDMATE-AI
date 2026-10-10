import { apiClient } from './client';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  goal?: string | null;
}

export interface AuthResponse {
  success: boolean;
  user: UserProfile;
  token?: string;
  error?: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  goal?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export const authApi = {
  async register(input: RegisterInput): Promise<AuthResponse> {
    return apiClient<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async login(input: LoginInput): Promise<AuthResponse> {
    return apiClient<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async logout(): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>('/api/auth/logout', {
      method: 'POST',
    });
  },

  async getMe(): Promise<{ success: boolean; user: UserProfile }> {
    return apiClient<{ success: boolean; user: UserProfile }>('/api/auth/me', {
      method: 'GET',
    });
  },
};
