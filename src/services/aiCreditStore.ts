/**
 * AI Credit Ledger & Usage Metering Store Service
 * Enforces atomic credit reservations, usage event auditing, and BYOK/Managed mode toggles.
 */

import {
  AICreditWallet,
  AIUsageEvent,
  CreditLedgerEntry,
  CreditPackage,
  AIMode,
  BYOKConfig,
  BYOKProvider,
} from '../domain/types';

const AI_STORAGE_KEYS = {
  WALLET: 'kenz_ai_wallet_v1',
  USAGE_EVENTS: 'kenz_ai_usage_events_v1',
  LEDGER: 'kenz_ai_ledger_v1',
  AI_MODE: 'kenz_ai_mode_v1',
  BYOK_KEY: 'kenz_ai_byok_key_v1',
};

// Credit Packages Catalogue (with local DZD pricing reference)
export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'pack_starter',
    name: 'Pack Découverte',
    credits: 250,
    priceMinor: 50000, // 500.00 DZD
    currency: 'DZD',
    description: 'Idéal pour ~12 analyses approfondies et explications de budget.',
  },
  {
    id: 'pack_popular',
    name: 'Pack Épargne & Sérénité',
    credits: 1000,
    priceMinor: 180000, // 1,800.00 DZD
    currency: 'DZD',
    description: 'Recommandé : ~50 analyses, détection des fuites et conseils personnalisés.',
  },
  {
    id: 'pack_pro',
    name: 'Pack Pro / Artisan',
    credits: 2500,
    priceMinor: 400000, // 4,000.00 DZD
    currency: 'DZD',
    description: 'Volume élevé : ~125 requêtes d’optimisation financière et catégorisation.',
  },
];

export const COST_PER_QUERY_CREDITS = 20;

const DEFAULT_WALLET: AICreditWallet = {
  userId: 'usr_local_1',
  balanceCredits: 500, // 500 free introductory credits
  lifetimeCreditsUsed: 0,
  updatedAt: new Date().toISOString(),
};

const memoryStore: Record<string, string> = {};

function getStoreItem(key: string): string | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return memoryStore[key] || null;
}

function setStoreItem(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }
  memoryStore[key] = value;
}

function removeStoreItem(key: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(key);
  }
  delete memoryStore[key];
}

export function loadAICreditWallet(): AICreditWallet {
  try {
    const raw = getStoreItem(AI_STORAGE_KEYS.WALLET);
    if (!raw) {
      setStoreItem(AI_STORAGE_KEYS.WALLET, JSON.stringify(DEFAULT_WALLET));
      return DEFAULT_WALLET;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_WALLET;
  }
}

export function saveAICreditWallet(wallet: AICreditWallet): void {
  try {
    setStoreItem(AI_STORAGE_KEYS.WALLET, JSON.stringify(wallet));
  } catch (e) {
    console.error('Failed to save AI credit wallet', e);
  }
}
export function loadCreditLedger(): CreditLedgerEntry[] {
  try {
    const raw = getStoreItem(AI_STORAGE_KEYS.LEDGER);
    if (!raw) {
      const initialEntry: CreditLedgerEntry = {
        id: 'ledg_grant_init',
        userId: 'usr_local_1',
        entryType: 'grant',
        creditsDelta: 500,
        balanceAfter: 500,
        referenceId: 'welcome_gift',
        description: 'Crédits de bienvenue offerts (500 crédits IA gérés)',
        createdAt: new Date().toISOString(),
      };
      setStoreItem(AI_STORAGE_KEYS.LEDGER, JSON.stringify([initialEntry]));
      return [initialEntry];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCreditLedger(entries: CreditLedgerEntry[]): void {
  try {
    setStoreItem(AI_STORAGE_KEYS.LEDGER, JSON.stringify(entries));
  } catch (e) {
    console.error('Failed to save credit ledger', e);
  }
}

export function loadAIUsageEvents(): AIUsageEvent[] {
  try {
    const raw = getStoreItem(AI_STORAGE_KEYS.USAGE_EVENTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAIUsageEvents(events: AIUsageEvent[]): void {
  try {
    setStoreItem(AI_STORAGE_KEYS.USAGE_EVENTS, JSON.stringify(events));
  } catch (e) {
    console.error('Failed to save AI usage events', e);
  }
}

export function getAIMode(): AIMode {
  return (getStoreItem(AI_STORAGE_KEYS.AI_MODE) as AIMode) || 'managed';
}

export function setAIMode(mode: AIMode): void {
  setStoreItem(AI_STORAGE_KEYS.AI_MODE, mode);
}

export interface BYOKProviderPreset {
  id: BYOKProvider;
  name: string;
  defaultModel: string;
  suggestedModels: string[];
  defaultBaseUrl?: string;
  placeholder: string;
  keyPrefixHint: string;
  helpText: string;
  docUrl: string;
}

export const BYOK_PROVIDER_PRESETS: Record<BYOKProvider, BYOKProviderPreset> = {
  google: {
    id: 'google',
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    suggestedModels: ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-2.5-pro'],
    placeholder: 'AIzaSy...',
    keyPrefixHint: 'Commence par AIzaSy',
    helpText: 'Clé issue de Google AI Studio (aistudio.google.com)',
    docUrl: 'https://aistudio.google.com/apikey',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
    defaultBaseUrl: 'https://api.openai.com/v1',
    placeholder: 'sk-proj-...',
    keyPrefixHint: 'Commence par sk-',
    helpText: 'Clé issue de la console OpenAI (platform.openai.com)',
    docUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    defaultModel: 'claude-3-5-sonnet-20241022',
    suggestedModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    placeholder: 'sk-ant-api03-...',
    keyPrefixHint: 'Commence par sk-ant-',
    helpText: 'Clé issue de la console Anthropic (console.anthropic.com)',
    docUrl: 'https://console.anthropic.com/settings/keys',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    defaultBaseUrl: 'https://api.deepseek.com',
    placeholder: 'sk-...',
    keyPrefixHint: 'Clé DeepSeek API',
    helpText: 'Tarification ultra-économique pour les particuliers et PME',
    docUrl: 'https://platform.deepseek.com/api_keys',
  },
  groq: {
    id: 'groq',
    name: 'Groq Cloud',
    defaultModel: 'llama-3.3-70b-versatile',
    suggestedModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    placeholder: 'gsk_...',
    keyPrefixHint: 'Commence par gsk_',
    helpText: 'Inférence Llama 3 ultra-rapide avec un généreux quota gratuit',
    docUrl: 'https://console.groq.com/keys',
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    defaultModel: 'mistral-small-latest',
    suggestedModels: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest'],
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    placeholder: 'Clé Mistral...',
    keyPrefixHint: 'Clé La Plateforme Mistral',
    helpText: 'Modèles souverains multilingues très performants en français',
    docUrl: 'https://console.mistral.ai/api-keys/',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    suggestedModels: [
      'meta-llama/llama-3.3-70b-instruct',
      'google/gemini-2.5-flash',
      'anthropic/claude-3.5-sonnet',
      'deepseek/deepseek-chat',
    ],
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    placeholder: 'sk-or-v1-...',
    keyPrefixHint: 'Commence par sk-or-',
    helpText: 'Accès universel à +100 modèles via une seule clé',
    docUrl: 'https://openrouter.ai/keys',
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    defaultModel: 'sonar',
    suggestedModels: ['sonar', 'sonar-pro'],
    defaultBaseUrl: 'https://api.perplexity.ai',
    placeholder: 'pplx-...',
    keyPrefixHint: 'Commence par pplx-',
    helpText: 'Recherche et synthèse d’informations en temps réel',
    docUrl: 'https://www.perplexity.ai/settings/api',
  },
  custom: {
    id: 'custom',
    name: 'Point de terminaison Personnalisé / Local',
    defaultModel: 'local-model',
    suggestedModels: ['local-model', 'llama3', 'mistral', 'qwen'],
    defaultBaseUrl: 'http://localhost:11434/v1',
    placeholder: 'Clé optionnelle (ou vide si non requis)...',
    keyPrefixHint: 'Compatible OpenAI API',
    helpText: 'Ollama, LM Studio, vLLM, Together AI, ou votre propre serveur privé',
    docUrl: 'https://github.com/ollama/ollama',
  },
};

export function detectProviderFromKey(key: string): BYOKProvider | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('sk-ant-')) return 'anthropic';
  if (trimmed.startsWith('gsk_')) return 'groq';
  if (trimmed.startsWith('sk-or-')) return 'openrouter';
  if (trimmed.startsWith('pplx-')) return 'perplexity';
  if (trimmed.startsWith('AIzaSy')) return 'google';
  if (trimmed.startsWith('sk-proj-')) return 'openai';
  return null;
}

export const DEFAULT_BYOK_CONFIG: BYOKConfig = {
  provider: 'google',
  apiKey: '',
  model: 'gemini-2.5-flash',
};

export function getBYOKConfig(): BYOKConfig {
  try {
    const raw = getStoreItem('kenz_ai_byok_config_v1');
    if (!raw) {
      // Backward compatibility with legacy key
      const legacyKey = getStoreItem(AI_STORAGE_KEYS.BYOK_KEY);
      if (legacyKey) {
        const detected = detectProviderFromKey(legacyKey) || 'google';
        const preset = BYOK_PROVIDER_PRESETS[detected];
        return {
          provider: detected,
          apiKey: legacyKey,
          model: preset.defaultModel,
          baseUrl: preset.defaultBaseUrl,
        };
      }
      return DEFAULT_BYOK_CONFIG;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_BYOK_CONFIG;
  }
}

export function setBYOKConfig(config: BYOKConfig): void {
  setStoreItem('kenz_ai_byok_config_v1', JSON.stringify(config));
  if (config.apiKey) {
    setStoreItem(AI_STORAGE_KEYS.BYOK_KEY, config.apiKey);
  } else {
    removeStoreItem(AI_STORAGE_KEYS.BYOK_KEY);
  }
}

export function getBYOKKey(): string {
  return getBYOKConfig().apiKey;
}

export function setBYOKKey(key: string): void {
  const current = getBYOKConfig();
  setBYOKConfig({ ...current, apiKey: key });
}

/**
 * Universal BYOK Credential Verification
 * Calls the backend test endpoint to verify model access without charging credits.
 */
export async function testBYOKCredentials(config: BYOKConfig): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  latencyMs?: number;
}> {
  try {
    const res = await fetch('/api/ai/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        byokProvider: config.provider,
        byokKey: config.apiKey,
        byokModel: config.model,
        byokBaseUrl: config.baseUrl,
      }),
    });
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      return { success: false, error: `Erreur serveur (${res.status}): ${text.slice(0, 120)}` };
    }
    const data = await res.json();
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur de connexion';
    return { success: false, error: message };
  }
}

/**
 * Atomic credit deduction with immutable ledger entry and audit event.
 */
export function deductAICredits(params: {
  userId: string;
  creditsToDebit: number;
  purpose: AIUsageEvent['purpose'];
  tokensInput?: number;
  tokensOutput?: number;
  mode: AIMode;
  provider?: string;
  model?: string;
}): { success: boolean; newBalance: number; reason?: string } {
  const {
    userId,
    creditsToDebit,
    purpose,
    tokensInput = 0,
    tokensOutput = 0,
    mode,
    provider,
    model,
  } = params;

  if (mode === 'byok') {
    const currentConfig = getBYOKConfig();
    const resolvedProvider = provider || currentConfig.provider;
    const resolvedModel = model || currentConfig.model;

    // BYOK mode: user pays model provider directly, 0 platform credits debited
    const usageEvent: AIUsageEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId,
      mode: 'byok',
      provider: resolvedProvider,
      model: resolvedModel,
      tokensInput,
      tokensOutput,
      creditsDebited: 0,
      purpose,
      createdAt: new Date().toISOString(),
    };
    const events = loadAIUsageEvents();
    saveAIUsageEvents([usageEvent, ...events]);

    const wallet = loadAICreditWallet();
    return { success: true, newBalance: wallet.balanceCredits };
  }

  // Managed mode: Atomic balance verification
  const wallet = loadAICreditWallet();
  if (wallet.balanceCredits < creditsToDebit) {
    return {
      success: false,
      newBalance: wallet.balanceCredits,
      reason: `Crédits insuffisants. Requis : ${creditsToDebit}, Disponible : ${wallet.balanceCredits}`,
    };
  }

  const newBalance = wallet.balanceCredits - creditsToDebit;
  const updatedWallet: AICreditWallet = {
    ...wallet,
    balanceCredits: newBalance,
    lifetimeCreditsUsed: wallet.lifetimeCreditsUsed + creditsToDebit,
    updatedAt: new Date().toISOString(),
  };
  saveAICreditWallet(updatedWallet);

  // Add ledger entry
  const ledger = loadCreditLedger();
  const ledgerEntry: CreditLedgerEntry = {
    id: `ledg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    entryType: 'usage_debit',
    creditsDelta: -creditsToDebit,
    balanceAfter: newBalance,
    referenceId: purpose,
    description: `Débit IA (${purpose})`,
    createdAt: new Date().toISOString(),
  };
  saveCreditLedger([ledgerEntry, ...ledger]);

  // Record usage event
  const usageEvents = loadAIUsageEvents();
  const usageEvent: AIUsageEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    mode: 'managed',
    provider: 'google_gemini',
    model: 'gemini-3.8-flash',
    tokensInput,
    tokensOutput,
    creditsDebited: creditsToDebit,
    purpose,
    createdAt: new Date().toISOString(),
  };
  saveAIUsageEvents([usageEvent, ...usageEvents]);

  return { success: true, newBalance };
}

/**
 * Top-up / purchase credits with ledger accounting
 */
export function purchaseCredits(userId: string, packageItem: CreditPackage): { newBalance: number } {
  const wallet = loadAICreditWallet();
  const newBalance = wallet.balanceCredits + packageItem.credits;

  const updatedWallet: AICreditWallet = {
    ...wallet,
    balanceCredits: newBalance,
    updatedAt: new Date().toISOString(),
  };
  saveAICreditWallet(updatedWallet);

  const ledger = loadCreditLedger();
  const ledgerEntry: CreditLedgerEntry = {
    id: `ledg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    entryType: 'purchase',
    creditsDelta: packageItem.credits,
    balanceAfter: newBalance,
    referenceId: packageItem.id,
    description: `Achat ${packageItem.name} (+${packageItem.credits} crédits)`,
    createdAt: new Date().toISOString(),
  };
  saveCreditLedger([ledgerEntry, ...ledger]);

  return { newBalance };
}
