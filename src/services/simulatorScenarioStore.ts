import { getSupabaseClient } from './supabase';

export interface SimulatorScenarioOverride {
  productId: string;
  quantityPerPersonPerDayMilliUnits: number;
}

export interface SimulatorScenario {
  id: string;
  title: string;
  month: string;
  adults: number;
  children: number;
  child_consumption_permille: number;
  basket_overrides: SimulatorScenarioOverride[];
  updated_at: string;
}

export type ScenarioStoreResult<T> =
  | { success: true; data: T }
  | { success: false; reason: 'not_configured' | 'not_authenticated' | 'database_error'; message?: string };

async function authenticatedClient(userId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: 'not_configured' as const };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== userId) return { error: 'not_authenticated' as const };
  return { supabase };
}

/** Scenarios contain only household assumptions and product quantities, never budgets or account data. */
export async function listSimulatorScenarios(userId: string): Promise<ScenarioStoreResult<SimulatorScenario[]>> {
  const auth = await authenticatedClient(userId);
  if ('error' in auth) return { success: false, reason: auth.error, message: 'Sign in to sync your scenarios.' };
  const { data, error } = await auth.supabase
    .from('simulator_scenarios')
    .select('id,title,month,adults,children,child_consumption_permille,basket_overrides,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error) return { success: false, reason: 'database_error', message: error.message };
  return { success: true, data: (data || []) as SimulatorScenario[] };
}

export async function saveSimulatorScenario(input: {
  userId: string;
  title: string;
  month: string;
  adults: number;
  children: number;
  basket: SimulatorScenarioOverride[];
}): Promise<ScenarioStoreResult<SimulatorScenario>> {
  const auth = await authenticatedClient(input.userId);
  if ('error' in auth) return { success: false, reason: auth.error, message: 'Sign in to sync your scenarios.' };
  const { data, error } = await auth.supabase
    .from('simulator_scenarios')
    .insert({
      user_id: input.userId,
      title: input.title.trim().slice(0, 80),
      month: `${input.month}-01`,
      adults: input.adults,
      children: input.children,
      child_consumption_permille: 500,
      basket_overrides: input.basket,
    })
    .select('id,title,month,adults,children,child_consumption_permille,basket_overrides,updated_at')
    .single();
  if (error || !data) return { success: false, reason: 'database_error', message: error?.message || 'Could not save scenario.' };
  return { success: true, data: data as SimulatorScenario };
}

export async function deleteSimulatorScenario(userId: string, scenarioId: string): Promise<ScenarioStoreResult<boolean>> {
  const auth = await authenticatedClient(userId);
  if ('error' in auth) return { success: false, reason: auth.error, message: 'Sign in to sync your scenarios.' };
  const { error } = await auth.supabase
    .from('simulator_scenarios')
    .delete()
    .eq('id', scenarioId)
    .eq('user_id', userId);
  if (error) return { success: false, reason: 'database_error', message: error.message };
  return { success: true, data: true };
}
