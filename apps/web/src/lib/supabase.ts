import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured =
  Boolean(url) &&
  Boolean(publishableKey) &&
  !url?.includes('YOUR_PROJECT_REF') &&
  !publishableKey?.includes('REPLACE_ME');

export const supabase = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      global: { headers: { 'x-application-name': 'motosave-web' } },
    })
  : null;
