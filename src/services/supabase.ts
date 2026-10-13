/**
 * Supabase Client Integration & Configuration Service
 * Provides Supabase PostgreSQL connection with fallback to local-first offline storage.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEYS = {
  SUPABASE_URL: 'kenz_supabase_url',
  SUPABASE_ANON_KEY: 'kenz_supabase_anon_key',
};

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getStoredSupabaseConfig(): SupabaseConfig {
  const envUrl = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY || '';

  const storedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '' : '';
  const storedKey = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.SUPABASE_ANON_KEY) || '' : '';

  return {
    url: storedUrl || envUrl,
    anonKey: storedKey || envKey,
  };
}

export function saveSupabaseConfig(config: SupabaseConfig): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.SUPABASE_URL, config.url);
    localStorage.setItem(STORAGE_KEYS.SUPABASE_ANON_KEY, config.anonKey);
  }
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getStoredSupabaseConfig();
  if (!url || !anonKey) {
    return null;
  }

  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    } catch {
      return null;
    }
  }

  return supabaseInstance;
}

export async function testSupabaseConnection(config: SupabaseConfig): Promise<{ success: boolean; message: string }> {
  if (!config.url || !config.anonKey) {
    return { success: false, message: 'Supabase URL and Anon Key are required.' };
  }

  try {
    const testClient = createClient(config.url, config.anonKey);
    // Ping public profiles table or auth health
    const { error } = await testClient.from('profiles').select('id').limit(1);
    if (error && error.code !== 'PGRST116' && !error.message.includes('permission denied')) {
      // If table doesn't exist yet, explain migration needed
      if (error.message.includes('relation "public.profiles" does not exist')) {
        return {
          success: true,
          message: 'Connected to Supabase PostgreSQL! (Run migrations to create tables).',
        };
      }
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Successfully connected to Supabase PostgreSQL!' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown connection error';
    return { success: false, message: msg };
  }
}
