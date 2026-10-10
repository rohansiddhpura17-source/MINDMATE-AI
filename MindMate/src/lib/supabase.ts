/**
 * MindMate - Local Supabase Compatibility Bridge
 * 
 * Provides a mock / local proxy for Supabase client calls so components
 * expecting `supabase.from(...)` or `supabase.auth` run locally against
 * the MindMate backend without requiring remote cloud credentials.
 */

export const supabase = {
  auth: {
    getSession: async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const body = await res.json();
          if (body.user) {
            return {
              data: {
                session: {
                  user: {
                    id: body.user.id,
                    email: body.user.email,
                    user_metadata: {
                      name: body.user.name,
                      goal: body.user.goal,
                    },
                  },
                },
              },
              error: null,
            };
          }
        }
      } catch (_) {}
      return { data: { session: null }, error: null };
    },
    signInWithPassword: async ({ email, password }: any) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Login failed' }));
        return { data: null, error: new Error(err.error || 'Login failed') };
      }
      const data = await res.json();
      return { data, error: null };
    },
    signUp: async ({ email, password, options }: any) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          name: options?.data?.name || email.split('@')[0],
          goal: options?.data?.goal,
        }),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Registration failed' }));
        return { data: null, error: new Error(err.error || 'Registration failed') };
      }
      const data = await res.json();
      return { data, error: null };
    },
    signOut: async () => {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      return { error: res.ok ? null : new Error('Logout failed') };
    },
    onAuthStateChange: (callback: any) => {
      // Trigger once on initialization
      fetch('/api/auth/me', { credentials: 'include' })
        .then((r) => r.json())
        .then((body) => {
          if (body?.user) {
            callback('SIGNED_IN', {
              user: {
                id: body.user.id,
                email: body.user.email,
                user_metadata: { name: body.user.name, goal: body.user.goal },
              },
            });
          } else {
            callback('SIGNED_OUT', null);
          }
        })
        .catch(() => callback('SIGNED_OUT', null));

      return {
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
      };
    },
  },

  from: (table: string) => {
    // Transparent query builder mapping to /api/db/:table
    return {
      select: (_cols = '*') => {
        return {
          eq: (col: string, val: any) => {
            return {
              single: async () => {
                const res = await fetch(`/api/db/${table}/${val}`, { credentials: 'include' });
                const json = await res.json();
                return { data: json.data || null, error: res.ok ? null : json.error };
              },
              order: async () => {
                const res = await fetch(`/api/db/${table}`, { credentials: 'include' });
                const json = await res.json();
                return { data: json.data || [], error: res.ok ? null : json.error };
              },
            };
          },
          order: (_col: string, _opts: any = {}) => {
            return {
              limit: async (_n: number) => {
                const res = await fetch(`/api/db/${table}`, { credentials: 'include' });
                const json = await res.json();
                return { data: json.data || [], error: res.ok ? null : json.error };
              },
            };
          },
        };
      },
      insert: async (payload: any) => {
        const res = await fetch(`/api/db/${table}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
        });
        const json = await res.json();
        return { data: json.data || null, error: res.ok ? null : json.error };
      },
      update: (payload: any) => {
        return {
          eq: async (_col: string, val: any) => {
            const res = await fetch(`/api/db/${table}/${val}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              credentials: 'include',
            });
            const json = await res.json();
            return { data: json.data || null, error: res.ok ? null : json.error };
          },
        };
      },
      delete: () => {
        return {
          eq: async (_col: string, val: any) => {
            const res = await fetch(`/api/db/${table}/${val}`, {
              method: 'DELETE',
              credentials: 'include',
            });
            const json = await res.json();
            return { data: json, error: res.ok ? null : json.error };
          },
        };
      },
    };
  },
};
