import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Coins,
  ShieldCheck,
  TrendingUp,
  Search,
  Plus,
  History,
  Key,
  AlertCircle,
  Check,
  Cpu,
  Globe,
} from 'lucide-react';
import {
  AICreditWallet,
  CreditLedgerEntry,
  AIMode,
  UserProfile,
  SafeToSpendBreakdown,
  Transaction,
  RecurringItem,
  BYOKConfig,
  BYOKProvider,
  DebtEntry,
} from '../domain/types';
import {
  CREDIT_PACKAGES,
  COST_PER_QUERY_CREDITS,
  deductAICredits,
  purchaseCredits,
  getAIMode,
  setAIMode,
  getBYOKConfig,
  setBYOKConfig,
  loadCreditLedger,
  BYOK_PROVIDER_PRESETS,
  detectProviderFromKey,
  testBYOKCredentials,
} from '../services/aiCreditStore';
import { formatMoney } from '../domain/financialCalculations';
import { calculateDebtSummary } from '../services/debtStore';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: AICreditWallet;
  profile: UserProfile;
  safeToSpend: SafeToSpendBreakdown;
  transactions: Transaction[];
  recurringItems: RecurringItem[];
  debts?: DebtEntry[];
  onWalletUpdated: () => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  wallet,
  profile,
  safeToSpend,
  transactions,
  recurringItems,
  debts = [],
  onWalletUpdated,
}) => {
  const [mode, setModeState] = useState<AIMode>(getAIMode());
  const [byokConfig, setByokConfigState] = useState<BYOKConfig>(() => getBYOKConfig());
  const [activeTab, setActiveTab] = useState<'advisor' | 'recharge' | 'ledger' | 'settings'>('advisor');

  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [responseSource, setResponseSource] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Testing BYOK credentials state
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    latencyMs?: number;
  } | null>(null);

  const [ledgerEntries, setLedgerEntries] = useState<CreditLedgerEntry[]>(() => loadCreditLedger());

  if (!isOpen) return null;

  const handleModeChange = (newMode: AIMode) => {
    setModeState(newMode);
    setAIMode(newMode);
    setTestResult(null);
  };

  const handleUpdateBYOK = (updates: Partial<BYOKConfig>) => {
    const updated = { ...byokConfig, ...updates };
    setByokConfigState(updated);
    setBYOKConfig(updated);
    setTestResult(null);
  };

  const handleProviderChange = (newProvider: BYOKProvider) => {
    const preset = BYOK_PROVIDER_PRESETS[newProvider];
    handleUpdateBYOK({
      provider: newProvider,
      model: preset.defaultModel,
      baseUrl: preset.defaultBaseUrl,
    });
  };

  const handleApiKeyChange = (rawKey: string) => {
    const detected = detectProviderFromKey(rawKey);
    if (detected && detected !== byokConfig.provider) {
      const preset = BYOK_PROVIDER_PRESETS[detected];
      handleUpdateBYOK({
        apiKey: rawKey,
        provider: detected,
        model: preset.defaultModel,
        baseUrl: preset.defaultBaseUrl,
      });
    } else {
      handleUpdateBYOK({ apiKey: rawKey });
    }
  };

  const handleTestConnection = async () => {
    if (!byokConfig.apiKey.trim() && byokConfig.provider !== 'custom') {
      setTestResult({ success: false, error: 'Veuillez saisir une clé API à tester.' });
      return;
    }
    setIsTestingKey(true);
    setTestResult(null);
    try {
      const result = await testBYOKCredentials(byokConfig);
      setTestResult(result);
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleExecuteAI = async (
    purpose:
      | 'explain_budget'
      | 'spending_leak_detector'
      | 'savings_optimizer'
      | 'debt_kredy_optimizer'
      | 'general_query',
    customPrompt?: string
  ) => {
    setError(null);
    setAiResponse(null);

    // 1. Credit Check in Managed Mode
    if (mode === 'managed' && wallet.balanceCredits < COST_PER_QUERY_CREDITS) {
      setError(
        `Crédits insuffisants (${wallet.balanceCredits} disponibles). Veuillez recharger votre portefeuille IA.`
      );
      setActiveTab('recharge');
      return;
    }

    // 1b. Check BYOK key if in BYOK mode
    if (mode === 'byok' && !byokConfig.apiKey.trim()) {
      setError(`Veuillez configurer votre clé API ${byokConfig.provider.toUpperCase()} dans l'onglet Mode IA.`);
      setActiveTab('settings');
      return;
    }

    setIsLoading(true);

    try {
      const debtSum = calculateDebtSummary(debts);
      const queryPrompt =
        customPrompt ||
        (purpose === 'explain_budget'
          ? 'Explique-moi la situation de mon reste à vivre et mon rythme de dépense.'
          : purpose === 'spending_leak_detector'
          ? 'Identifie mes postes de fuite de dépenses et propose 2 pistes pour économiser.'
          : purpose === 'debt_kredy_optimizer'
          ? 'Analyse mon carnet de dettes et ardoises de commerçants (Kredy) et conseille-moi une stratégie de remboursement prioritaire.'
          : 'Comment optimiser mon épargne d’ici la prochaine paye ?');

      // 2. Call Server-Side Universal AI Gateway
      const res = await fetch('/api/ai/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose,
          userPrompt: queryPrompt,
          financialContext: {
            safeToSpendFormatted: formatMoney(
              safeToSpend.safeToSpendMinor,
              profile.preferredCurrency,
              profile.locale
            ),
            dailyGuidelineFormatted: formatMoney(
              safeToSpend.dailyGuidelineMinor,
              profile.preferredCurrency,
              profile.locale
            ),
            availableBalance: formatMoney(
              safeToSpend.availableBalanceMinor,
              profile.preferredCurrency,
              profile.locale
            ),
            daysUntilPayday: safeToSpend.daysUntilPayday,
            unpaidBillsCount: recurringItems.filter((i) => i.isActive && i.type === 'expense').length,
            recentTransactionsCount: transactions.length,
            kredyDebtsPayable: formatMoney(debtSum.totalPayableMinor, profile.preferredCurrency),
            kredyDebtsReceivable: formatMoney(debtSum.totalReceivableMinor, profile.preferredCurrency),
            overdueDebtsCount: debtSum.overdueCount,
          },
          byokProvider: mode === 'byok' ? byokConfig.provider : 'google',
          byokKey: mode === 'byok' ? byokConfig.apiKey : undefined,
          byokModel: mode === 'byok' ? byokConfig.model : undefined,
          byokBaseUrl: mode === 'byok' ? byokConfig.baseUrl : undefined,
        }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Erreur serveur (${res.status}): ${text.slice(0, 120)}`);
      }
      const data = await res.json();

      if (data.success) {
        setAiResponse(data.text);
        setResponseSource(data.source);

        // 3. Deduct Credits Atomically (0 credits debited if BYOK)
        deductAICredits({
          userId: profile.id,
          creditsToDebit: COST_PER_QUERY_CREDITS,
          purpose,
          tokensInput: data.tokensInput || 150,
          tokensOutput: data.tokensOutput || 120,
          mode,
          provider: mode === 'byok' ? byokConfig.provider : 'google',
          model: mode === 'byok' ? byokConfig.model : 'gemini-2.5-flash',
        });

        onWalletUpdated();
        setLedgerEntries(loadCreditLedger());
      } else {
        setError(data.error || "Impossible de contacter l'assistant IA.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau';
      setError(`Erreur: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = (pkg: typeof CREDIT_PACKAGES[0]) => {
    purchaseCredits(profile.id, pkg);
    onWalletUpdated();
    setLedgerEntries(loadCreditLedger());
    setActiveTab('advisor');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-950/60 text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Coach IA & Économies</h2>
              <span className="text-[11px] text-slate-400">
                {mode === 'managed'
                  ? 'Modèle Géré · Crédits Prépayés'
                  : `BYOK Universel · ${byokConfig.provider.toUpperCase()} (${byokConfig.model})`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Wallet badge */}
            <button
              onClick={() => setActiveTab('recharge')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-xs font-mono-numbers text-amber-300 hover:border-amber-700/60 transition"
              title="Voir solde et recharger"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>{wallet.balanceCredits} cr.</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-nav tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('advisor')}
            className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition cursor-pointer min-h-[36px] ${
              activeTab === 'advisor'
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Conseils
          </button>
          <button
            onClick={() => setActiveTab('recharge')}
            className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition cursor-pointer min-h-[36px] ${
              activeTab === 'recharge'
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Recharger
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition cursor-pointer min-h-[36px] ${
              activeTab === 'ledger'
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Historique ({ledgerEntries.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-1.5 px-2 rounded-lg font-semibold transition cursor-pointer min-h-[36px] ${
              activeTab === 'settings'
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mode IA & BYOK
          </button>
        </div>

        {/* TAB 1: ADVISOR ACTIONS */}
        {activeTab === 'advisor' && (
          <div className="space-y-4">
            {/* Quick Actions Strip */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                {mode === 'managed'
                  ? `Analyses prêtes en un clic (${COST_PER_QUERY_CREDITS} crédits / requête)`
                  : `Analyses en mode BYOK (${byokConfig.provider.toUpperCase()} · 0 crédit débité)`}
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  disabled={isLoading}
                  onClick={() => handleExecuteAI('explain_budget')}
                  className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition cursor-pointer flex flex-col justify-between min-h-[72px]"
                >
                  <span className="text-xs font-semibold text-slate-200 block">
                    Analyser reste à vivre
                  </span>
                  <span className="text-[10px] text-slate-400">Plafond & rythme</span>
                </button>

                <button
                  disabled={isLoading}
                  onClick={() => handleExecuteAI('spending_leak_detector')}
                  className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition cursor-pointer flex flex-col justify-between min-h-[72px]"
                >
                  <span className="text-xs font-semibold text-slate-200 block">
                    Détecteur de fuites
                  </span>
                  <span className="text-[10px] text-slate-400">Achats & forfaits</span>
                </button>

                <button
                  disabled={isLoading}
                  onClick={() => handleExecuteAI('savings_optimizer')}
                  className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition cursor-pointer flex flex-col justify-between min-h-[72px]"
                >
                  <span className="text-xs font-semibold text-slate-200 block">
                    Optimiser l'épargne
                  </span>
                  <span className="text-[10px] text-slate-400">Conseils avant paye</span>
                </button>

                <button
                  disabled={isLoading}
                  onClick={() => handleExecuteAI('debt_kredy_optimizer')}
                  className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-amber-800/50 text-left transition cursor-pointer flex flex-col justify-between min-h-[72px]"
                >
                  <span className="text-xs font-semibold text-amber-300 block">
                    Optimiser Kredy
                  </span>
                  <span className="text-[10px] text-slate-400">Prioriser dettes</span>
                </button>
              </div>
            </div>

            {/* Custom Query Input */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                Ou posez votre question personnalisée :
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ex. Comment préparer la facture de loyer de 28 000 DA ?"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="flex-1 h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
                <button
                  disabled={isLoading || !prompt.trim()}
                  onClick={() => {
                    handleExecuteAI('general_query', prompt.trim());
                    setPrompt('');
                  }}
                  className="px-4 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs transition cursor-pointer"
                >
                  {isLoading ? 'Analyse...' : 'Analyser'}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* AI Output Card */}
            {aiResponse && (
              <div className="rounded-2xl bg-slate-950 border border-emerald-900/50 p-4 space-y-2 shadow-lg">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Recommandation de l'Assistant
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono-numbers">
                    Moteur : {responseSource}
                  </span>
                </div>
                <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
                  {aiResponse}
                </div>
                <div className="pt-2 text-[10px] text-slate-500 border-t border-slate-800/60">
                  Note : Avis purement consultatif. Les calculs financiers réels demeurent stricts et déterministes.
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: RECHARGE CREDITS */}
        {activeTab === 'recharge' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-slate-200">Recharger vos crédits IA</h3>
              <p className="text-[11px] text-slate-400">
                Chaque analyse approfondie consomme 20 crédits. Choisissez votre pack :
              </p>
            </div>

            <div className="space-y-2.5">
              {CREDIT_PACKAGES.map((pkg) => (
                <div
                  key={pkg.id}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs font-bold text-slate-100 block">{pkg.name}</span>
                    <span className="text-[11px] text-slate-400 block">{pkg.description}</span>
                    <span className="text-xs font-mono-numbers font-bold text-amber-400 mt-1 block">
                      +{pkg.credits} crédits
                    </span>
                  </div>

                  <button
                    onClick={() => handlePurchase(pkg)}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition cursor-pointer min-h-[40px] shrink-0"
                  >
                    {formatMoney(pkg.priceMinor, pkg.currency, profile.locale)}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT LEDGER */}
        {activeTab === 'ledger' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Livre-journal immuable des crédits</span>
              <span className="font-mono-numbers">Solde : {wallet.balanceCredits} cr.</span>
            </div>

            <div className="divide-y divide-slate-800 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden max-h-60 overflow-y-auto">
              {ledgerEntries.map((entry) => (
                <div key={entry.id} className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-200 block">{entry.description}</span>
                    <span className="text-[10px] text-slate-500">{entry.createdAt.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <div className="text-right font-mono-numbers">
                    <span
                      className={`font-bold block ${
                        entry.creditsDelta > 0 ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {entry.creditsDelta > 0 ? '+' : ''}
                      {entry.creditsDelta} cr.
                    </span>
                    <span className="text-[10px] text-slate-500">Solde : {entry.balanceAfter}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: AI SETTINGS & UNIVERSAL BYOK */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-slate-200">Mode d'accès au modèle</h3>
              <p className="text-[11px] text-slate-400">
                Basculez entre le modèle géré prépayé et votre propre clé API (BYOK Universel).
              </p>
            </div>

            {/* Mode selection buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleModeChange('managed')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                  mode === 'managed'
                    ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <span className="text-xs font-bold block">1. Agent Géré</span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Crédits prépayés sur la plateforme.
                </span>
              </button>

              <button
                onClick={() => handleModeChange('byok')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                  mode === 'byok'
                    ? 'bg-blue-950/60 border-blue-700/80 text-blue-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <span className="text-xs font-bold block">2. Mode BYOK Universel</span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  Gemini, OpenAI, Claude ou personnalisé.
                </span>
              </button>
            </div>

            {/* Universal BYOK Configuration Form */}
            {mode === 'byok' && (
              <div className="space-y-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-slate-200">
                      BYOK Universel — Apportez n'importe quelle clé
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                    0 crédit déduit
                  </span>
                </div>

                {/* Provider Selection */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Fournisseur d'IA
                  </label>
                  <select
                    value={byokConfig.provider}
                    onChange={(e) => handleProviderChange(e.target.value as BYOKProvider)}
                    className="w-full h-11 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="google">Google Gemini (Gemini 2.5 / 3.8 Flash, Pro)</option>
                    <option value="openai">OpenAI (GPT-4o, GPT-4o mini, o3-mini)</option>
                    <option value="anthropic">Anthropic Claude (Claude 3.5 Sonnet, Haiku)</option>
                    <option value="deepseek">DeepSeek (deepseek-chat, deepseek-reasoner)</option>
                    <option value="groq">Groq Cloud (Llama 3.3 70B, Mixtral — Inférence Ultra-Rapide)</option>
                    <option value="mistral">Mistral AI (Mistral Small, Large, Codestral)</option>
                    <option value="openrouter">OpenRouter (Accès unifié à +100 modèles IA)</option>
                    <option value="perplexity">Perplexity (Sonar, Sonar Pro — Recherche web)</option>
                    <option value="custom">Endpoint Personnalisé / Local (Ollama, LM Studio, vLLM, Privé)</option>
                  </select>
                </div>

                {/* API Key Input with auto-detection */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-300">
                      Clé API {BYOK_PROVIDER_PRESETS[byokConfig.provider].name}
                    </label>
                    <a
                      href={BYOK_PROVIDER_PRESETS[byokConfig.provider].docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                    >
                      Obtenir une clé &rarr;
                    </a>
                  </div>
                  <input
                    type="password"
                    placeholder={BYOK_PROVIDER_PRESETS[byokConfig.provider].placeholder}
                    value={byokConfig.apiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                    <span>{BYOK_PROVIDER_PRESETS[byokConfig.provider].keyPrefixHint}</span>
                    <span>{BYOK_PROVIDER_PRESETS[byokConfig.provider].helpText}</span>
                  </div>
                </div>

                {/* Model Identifier & Quick Model Presets */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Identifiant du modèle
                  </label>
                  <input
                    type="text"
                    placeholder={BYOK_PROVIDER_PRESETS[byokConfig.provider].defaultModel}
                    value={byokConfig.model}
                    onChange={(e) => handleUpdateBYOK({ model: e.target.value })}
                    className="w-full h-11 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 focus:outline-none focus:border-blue-500"
                  />

                  {/* Model suggestion pills */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[10px] text-slate-500 self-center">Modèles suggérés :</span>
                    {BYOK_PROVIDER_PRESETS[byokConfig.provider].suggestedModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleUpdateBYOK({ model: m })}
                        className={`text-[10px] px-2 py-0.5 rounded-md font-mono-numbers transition cursor-pointer ${
                          byokConfig.model === m
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Base URL (for custom, openrouter, or self-hosted) */}
                {(byokConfig.provider === 'custom' || byokConfig.provider === 'openrouter' || byokConfig.baseUrl) && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      URL de base (Base URL)
                    </label>
                    <input
                      type="text"
                      placeholder={BYOK_PROVIDER_PRESETS[byokConfig.provider].defaultBaseUrl || 'http://localhost:11434/v1'}
                      value={byokConfig.baseUrl || ''}
                      onChange={(e) => handleUpdateBYOK({ baseUrl: e.target.value })}
                      className="w-full h-11 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      Compatible standard OpenAI Chat Completions (`/chat/completions`).
                    </span>
                  </div>
                )}

                {/* Live Test Connection Action */}
                <div className="pt-1">
                  <button
                    type="button"
                    disabled={isTestingKey}
                    onClick={handleTestConnection}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 border border-slate-700"
                  >
                    {isTestingKey ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                        <span>Vérification de la clé en cours...</span>
                      </>
                    ) : (
                      <>
                        <Cpu className="w-4 h-4 text-blue-400" />
                        <span>Tester la clé et la connexion en direct</span>
                      </>
                    )}
                  </button>

                  {/* Test Result Message */}
                  {testResult && (
                    <div
                      className={`mt-2.5 p-3 rounded-xl border text-xs flex items-start gap-2 ${
                        testResult.success
                          ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                          : 'bg-rose-950/60 border-rose-800 text-rose-300'
                      }`}
                    >
                      {testResult.success ? (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold block">
                          {testResult.success ? 'Clé vérifiée et opérationnelle !' : 'Échec du test de clé'}
                        </span>
                        <span className="text-[11px] block mt-0.5 opacity-90">
                          {testResult.message || testResult.error}
                          {testResult.latencyMs ? ` (Latence : ${testResult.latencyMs}ms)` : ''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-slate-500 leading-relaxed pt-1 border-t border-slate-900">
                  En mode BYOK Universel, vos requêtes sont envoyées directement au fournisseur de votre choix (Google, OpenAI, Anthropic, DeepSeek, Groq, Mistral, OpenRouter, ou votre instance locale). Vos clés restent privées dans votre navigateur et ne sont jamais stockées sur des serveurs tiers.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
