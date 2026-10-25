import { AlertTriangle } from 'lucide-react';
import { isSupabaseConfigured, supabaseConfigProblem } from '../../lib/supabase';

/**
 * Explains how to configure Supabase when credentials are missing or still set to
 * the `.env.example` placeholders. Renders nothing when Supabase is configured.
 */
export default function SupabaseSetupNotice() {
  if (isSupabaseConfigured) return null;

  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="space-y-1.5">
          <p className="font-semibold">Supabase is not configured</p>
          <p className="text-amber-800">{supabaseConfigProblem}</p>
          <p className="text-amber-800">
            Set <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> in the project&apos;s{' '}
            <code className="font-mono text-xs">.env</code> file (Supabase dashboard → Project Settings → API),
            then restart <code className="font-mono text-xs">npm run dev</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
