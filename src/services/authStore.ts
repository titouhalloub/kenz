/**
 * Phase 7 — User Authentication & Profile Management Service
 */

import { getSupabaseClient } from './supabase';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  country: string; // "Algérie (DZ)", "France (FR)", "Belgique (BE)", "Suisse (CH)", "Union Européenne / Autre"
  wilaya: string; // e.g. "16 - Alger" (when country is Algérie)
  region?: string; // e.g. "Île-de-France (75)" when country is France or EU
  avatarUrl?: string;
  membershipTier: 'Citoyen Free' | 'Kenz Premium' | 'Commerçant Pro';
  createdAt: string;
}

const STORAGE_KEYS = {
  CURRENT_USER: 'kenz_current_user',
  USERS_DB: 'kenz_local_users_db',
};

const DEFAULT_USER: UserProfile = {
  id: 'user_demo_01',
  email: 'citoyen@kenz.dz',
  fullName: 'Amine Benali',
  country: 'Algérie (DZ)',
  wilaya: '16 - Alger',
  membershipTier: 'Kenz Premium',
  createdAt: new Date().toISOString(),
};

export function loadCurrentUser(): UserProfile {
  if (typeof localStorage === 'undefined') return DEFAULT_USER;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(DEFAULT_USER));
      return DEFAULT_USER;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_USER;
  }
}

export function saveCurrentUser(user: UserProfile): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
}

export async function loginUser(email: string, password: string):Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { success: false, error: error.message };
      }
      if (data.user) {
        const profile: UserProfile = {
          id: data.user.id,
          email: data.user.email || email,
          fullName: data.user.user_metadata?.full_name || email.split('@')[0],
          wilaya: data.user.user_metadata?.wilaya || '16 - Alger',
          membershipTier: data.user.user_metadata?.tier || 'Citoyen Free',
          createdAt: data.user.created_at,
        };
        saveCurrentUser(profile);
        return { success: true, user: profile };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login error';
      return { success: false, error: msg };
    }
  }

  // Local fallback demo authentication
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || password.length < 4) {
    return { success: false, error: 'Veuillez entrer un email valide et un mot de passe (4 caractères min).' };
  }

  const existing = loadCurrentUser();
  const user: UserProfile = {
    ...existing,
    email: normalizedEmail,
    fullName: existing.email === normalizedEmail ? existing.fullName : normalizedEmail.split('@')[0],
  };
  saveCurrentUser(user);
  return { success: true, user };
}

export async function registerUser(email: string, password: string, fullName: string, country: string, wilaya: string, region?: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, country, wilaya, region, tier: 'Citoyen Free' },
        },
      });
      if (error) {
        return { success: false, error: error.message };
      }
      if (data.user) {
        const profile: UserProfile = {
          id: data.user.id,
          email,
          fullName,
          country,
          wilaya,
          region,
          membershipTier: 'Citoyen Free',
          createdAt: new Date().toISOString(),
        };
        saveCurrentUser(profile);
        return { success: true, user: profile };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration error';
      return { success: false, error: msg };
    }
  }

  // Local fallback registration
  const user: UserProfile = {
    id: 'user_' + Math.random().toString(36).substring(2, 9),
    email,
    fullName,
    country,
    wilaya,
    region,
    membershipTier: 'Citoyen Free',
    createdAt: new Date().toISOString(),
  };
  saveCurrentUser(user);
  return { success: true, user };
}

export function logoutUser(): void {
  const supabase = getSupabaseClient();
  if (supabase) {
    supabase.auth.signOut().catch(() => {});
  }
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
}

export async function updateUserProfile(
  currentUser: UserProfile,
  updates: { email?: string; fullName?: string; country?: string; wilaya?: string; region?: string; avatarUrl?: string }
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const supabase = getSupabaseClient();
  const newEmail = updates.email !== undefined ? updates.email.trim().toLowerCase() : currentUser.email;

  if (supabase) {
    try {
      if (updates.email && updates.email !== currentUser.email) {
        const { error: authError } = await supabase.auth.updateUser({ email: newEmail });
        if (authError) {
          return { success: false, error: authError.message };
        }
      }

      const profileUpdates: Record<string, any> = {
        email: newEmail,
        updated_at: new Date().toISOString(),
      };
      if (updates.fullName !== undefined) profileUpdates.display_name = updates.fullName;

      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', currentUser.id);

      if (profileError) {
        console.error('Failed to update Supabase profile:', profileError.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update error';
      return { success: false, error: msg };
    }
  }

  const updated: UserProfile = {
    ...currentUser,
    ...updates,
    email: newEmail,
  };
  saveCurrentUser(updated);
  return { success: true, user: updated };
}

