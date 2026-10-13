import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadAICreditWallet,
  saveAICreditWallet,
  loadCreditLedger,
  saveCreditLedger,
  deductAICredits,
  purchaseCredits,
  CREDIT_PACKAGES,
  COST_PER_QUERY_CREDITS,
  detectProviderFromKey,
  loadAIUsageEvents,
  setBYOKConfig,
  BYOK_PROVIDER_PRESETS,
} from './aiCreditStore';

describe('Phase 4 AI Credits & Metering Ledger', () => {
  beforeEach(() => {
    // Reset local wallet state
    saveAICreditWallet({
      userId: 'test_user',
      balanceCredits: 500,
      lifetimeCreditsUsed: 0,
      updatedAt: new Date().toISOString(),
    });
    saveCreditLedger([]);
  });

  it('initializes wallet with 500 credits', () => {
    const wallet = loadAICreditWallet();
    expect(wallet.balanceCredits).toBe(500);
  });

  it('atomically deducts credits and records immutable ledger entry in managed mode', () => {
    const result = deductAICredits({
      userId: 'test_user',
      creditsToDebit: COST_PER_QUERY_CREDITS, // 20
      purpose: 'explain_budget',
      mode: 'managed',
    });

    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(480);

    const updatedWallet = loadAICreditWallet();
    expect(updatedWallet.balanceCredits).toBe(480);
    expect(updatedWallet.lifetimeCreditsUsed).toBe(20);

    const ledger = loadCreditLedger();
    expect(ledger.length).toBe(1);
    expect(ledger[0].creditsDelta).toBe(-20);
    expect(ledger[0].balanceAfter).toBe(480);
    expect(ledger[0].entryType).toBe('usage_debit');
  });

  it('prevents overdraft: fails safely when balance is insufficient', () => {
    // Set wallet to low balance
    saveAICreditWallet({
      userId: 'test_user',
      balanceCredits: 10,
      lifetimeCreditsUsed: 0,
      updatedAt: new Date().toISOString(),
    });

    const result = deductAICredits({
      userId: 'test_user',
      creditsToDebit: 20,
      purpose: 'spending_leak_detector',
      mode: 'managed',
    });

    expect(result.success).toBe(false);
    expect(result.newBalance).toBe(10);
    expect(result.reason).toContain('Crédits insuffisants');

    // Balance remains intact
    const wallet = loadAICreditWallet();
    expect(wallet.balanceCredits).toBe(10);
  });

  it('does not debit platform credits in BYOK mode', () => {
    const result = deductAICredits({
      userId: 'test_user',
      creditsToDebit: 20,
      purpose: 'general_query',
      mode: 'byok',
    });

    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(500);

    const wallet = loadAICreditWallet();
    expect(wallet.balanceCredits).toBe(500);
  });

  it('correctly auto-detects AI provider from API key prefixes', () => {
    expect(detectProviderFromKey('sk-ant-api03-abcdefg')).toBe('anthropic');
    expect(detectProviderFromKey('gsk_1234567890')).toBe('groq');
    expect(detectProviderFromKey('sk-or-v1-abcdefg')).toBe('openrouter');
    expect(detectProviderFromKey('pplx-1234567890')).toBe('perplexity');
    expect(detectProviderFromKey('AIzaSyabcdef123456')).toBe('google');
    expect(detectProviderFromKey('sk-proj-abcdef123')).toBe('openai');
    expect(detectProviderFromKey('')).toBeNull();
  });

  it('records the active custom provider and model in BYOK usage audit events without gemini lock', () => {
    setBYOKConfig({
      provider: 'deepseek',
      apiKey: 'sk-deepseek-test-key',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
    });

    const result = deductAICredits({
      userId: 'test_user',
      creditsToDebit: 20,
      purpose: 'spending_leak_detector',
      mode: 'byok',
      provider: 'deepseek',
      model: 'deepseek-chat',
    });

    expect(result.success).toBe(true);
    const events = loadAIUsageEvents();
    expect(events.length).toBeGreaterThan(0);
    const latestEvent = events[0];
    expect(latestEvent.mode).toBe('byok');
    expect(latestEvent.provider).toBe('deepseek');
    expect(latestEvent.model).toBe('deepseek-chat');
    expect(latestEvent.creditsDebited).toBe(0);
  });

  it('provides complete preset configurations for universal AI providers', () => {
    const providers = ['google', 'openai', 'anthropic', 'deepseek', 'groq', 'mistral', 'openrouter', 'perplexity', 'custom'] as const;
    
    for (const p of providers) {
      expect(BYOK_PROVIDER_PRESETS[p]).toBeDefined();
      expect(BYOK_PROVIDER_PRESETS[p].defaultModel).toBeTruthy();
      expect(BYOK_PROVIDER_PRESETS[p].suggestedModels.length).toBeGreaterThan(0);
    }
  });

  it('recharges credits and logs purchase ledger entry', () => {
    const popularPack = CREDIT_PACKAGES[1]; // 1000 credits
    const purchaseResult = purchaseCredits('test_user', popularPack);

    expect(purchaseResult.newBalance).toBe(1500);

    const wallet = loadAICreditWallet();
    expect(wallet.balanceCredits).toBe(1500);

    const ledger = loadCreditLedger();
    expect(ledger.length).toBe(1);
    expect(ledger[0].creditsDelta).toBe(1000);
    expect(ledger[0].balanceAfter).toBe(1500);
    expect(ledger[0].entryType).toBe('purchase');
  });
});
