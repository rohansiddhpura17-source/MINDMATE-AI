import { createClient, SupabaseClient } from '@supabase/supabase-js';

const rawSupabaseUrl = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim();
const rawSupabaseAnonKey = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim();

/** Values shipped in `.env.example` that must be replaced with real project credentials. */
const PLACEHOLDER_MARKERS = ['your-project', 'your-supabase', 'placeholder', 'changeme'];

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Validates the Supabase environment configuration without throwing.
 * Returns a human-readable problem description, or `null` when the config looks usable.
 */
function validateSupabaseConfig(url: string, anonKey: string): string | null {
  const problems: string[] = [];

  if (!url) {
    problems.push('VITE_SUPABASE_URL is missing.');
  } else if (isPlaceholder(url)) {
    problems.push('VITE_SUPABASE_URL still contains the placeholder value from .env.example.');
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        problems.push('VITE_SUPABASE_URL must start with https:// (or http:// for a local Supabase instance).');
      }
    } catch {
      problems.push('VITE_SUPABASE_URL is not a valid URL.');
    }
  }

  if (!anonKey) {
    problems.push('VITE_SUPABASE_ANON_KEY is missing.');
  } else if (isPlaceholder(anonKey)) {
    problems.push('VITE_SUPABASE_ANON_KEY still contains the placeholder value from .env.example.');
  }

  return problems.length ? problems.join(' ') : null;
}

const configProblem = validateSupabaseConfig(rawSupabaseUrl, rawSupabaseAnonKey);

/** True when real-looking Supabase credentials are present. */
export const isSupabaseConfigured = configProblem === null;

/** Detailed description of what is wrong with the Supabase configuration (or `null`). */
export const supabaseConfigProblem = configProblem;

/** User-facing message used by auth flows when Supabase is not configured. */
export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  'Sign-in is unavailable because Supabase is not configured. Add VITE_SUPABASE_URL and ' +
  'VITE_SUPABASE_ANON_KEY to the .env file in the project root, then restart `npm run dev`.';

export class SupabaseConfigError extends Error {
  constructor() {
    super(SUPABASE_NOT_CONFIGURED_MESSAGE);
    this.name = 'SupabaseConfigError';
  }
}

/**
 * Inert stand-in used when credentials are missing. Every auth call and every query
 * resolves with a `SupabaseConfigError` instead of throwing at import time (which
 * previously crashed the whole module graph and left a blank page). No requests are
 * made and no user is ever authenticated by this client.
 */
function createUnconfiguredClient(): SupabaseClient {
  const configError = () => new SupabaseConfigError();

  // Chainable query builder: any method call returns the builder; awaiting it
  // resolves to `{ data: null, error }` like a failed Supabase query.
  const makeQuery = (): unknown => {
    const result = () => ({ data: null, error: configError(), count: null, status: 0, statusText: '' });
    const handler: ProxyHandler<() => void> = {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result()).then(resolve, reject);
        }
        return () => proxy;
      },
      apply() {
        return proxy;
      },
    };
    const proxy: unknown = new Proxy(() => {}, handler);
    return proxy;
  };

  const auth = {
    getSession: async () => ({ data: { session: null }, error: configError() }),
    getUser: async () => ({ data: { user: null }, error: configError() }),
    onAuthStateChange: () => ({ data: { subscription: { id: 'unconfigured', unsubscribe: () => {} } } }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: configError() }),
    signUp: async () => ({ data: { user: null, session: null }, error: configError() }),
    signOut: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ data: null, error: configError() }),
    updateUser: async () => ({ data: { user: null }, error: configError() }),
  };

  return {
    auth,
    from: () => makeQuery(),
    rpc: () => makeQuery(),
  } as unknown as SupabaseClient;
}

if (!isSupabaseConfigured) {
  console.warn(`[MindMate] Supabase is not configured: ${configProblem} Authentication and cloud sync are disabled.`);
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(rawSupabaseUrl, rawSupabaseAnonKey)
  : createUnconfiguredClient();

export type Database = {
  profiles: {
    id: string; name: string; email: string; goal: string | null;
    learning_style: string; preferred_session: string;
    streak: number; overall_mastery: number; learning_efficiency: number;
    created_at: string; updated_at: string;
  };
};
