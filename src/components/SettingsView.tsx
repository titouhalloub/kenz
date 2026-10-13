import React, { useState } from 'react';
import {
  Download,
  Trash2,
  PlusCircle,
  User,
  Wallet,
  ShieldCheck,
  Lock,
  Sparkles,
  Key,
  Cpu,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  UserProfile,
  Account,
  Business,
  BusinessDocument,
  BusinessReport,
  VerificationStatus,
  AIMode,
  BYOKConfig,
  BYOKProvider,
} from '../domain/types';
import { parseToMinorUnits, formatMoney } from '../domain/financialCalculations';
import { AdminDashboardModal } from './AdminDashboardModal';
import {
  getAIMode,
  setAIMode,
  getBYOKConfig,
  setBYOKConfig,
  BYOK_PROVIDER_PRESETS,
  detectProviderFromKey,
  testBYOKCredentials,
} from '../services/aiCreditStore';

interface SettingsViewProps {
  profile: UserProfile;
  accounts: Account[];
  businesses?: Business[];
  documents?: BusinessDocument[];
  reports?: BusinessReport[];
  onReviewBusiness?: (params: {
    businessId: string;
    reviewerId: string;
    newStatus: VerificationStatus;
    reasonCode: string;
    reviewerNotes?: string;
  }) => void;
  onResolveReport?: (reportId: string, status: 'resolved' | 'dismissed') => void;
  onUpdateProfile: (updates: Partial<UserProfile>) => void;
  onAddAccount: (data: Omit<Account, 'id'>) => void;
  onExportCSV: () => void;
  onWipeData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  accounts,
  businesses = [],
  documents = [],
  reports = [],
  onReviewBusiness,
  onResolveReport,
  onUpdateProfile,
  onAddAccount,
  onExportCSV,
  onWipeData,
}) => {
  // Account creation state
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<Account['type']>('cash');
  const [newAccBalanceStr, setNewAccBalanceStr] = useState('');

  // Wipe confirmation modal
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);

  // Admin dashboard modal state
  const [showAdminModal, setShowAdminModal] = useState(false);

  // Universal BYOK & AI Mode State
  const [aiMode, setAiModeState] = useState<AIMode>(() => getAIMode());
  const [byokConfig, setByokConfigState] = useState<BYOKConfig>(() => getBYOKConfig());
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    latencyMs?: number;
  } | null>(null);

  const handleAIModeChange = (newMode: AIMode) => {
    setAiModeState(newMode);
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

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) return;
    const balanceMinor = parseToMinorUnits(newAccBalanceStr);

    onAddAccount({
      userId: profile.id,
      name: newAccName.trim(),
      type: newAccType,
      currency: profile.preferredCurrency,
      initialBalanceMinor: balanceMinor,
      isArchived: false,
    });

    setNewAccName('');
    setNewAccBalanceStr('');
    setShowAddAccount(false);
  };

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-lg font-bold text-slate-100">Paramètres de l'application</h1>
        <p className="text-xs text-slate-400">
          Gérez votre profil, vos comptes de trésorerie et la confidentialité de vos données.
        </p>
      </div>

      {/* 1. User Profile & Planning Cadence */}
      <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Profil & Cadence financière</h2>
            <p className="text-[11px] text-slate-400">
              Personnalisation de vos cycles de paie et calcul du reste à vivre.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Nom d'affichage</label>
            <input
              type="text"
              value={profile.displayName}
              onChange={(e) => onUpdateProfile({ displayName: e.target.value })}
              className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Jour de paye habituel (1 - 31)
            </label>
            <input
              type="number"
              min="1"
              max="31"
              value={profile.paydayDayOfMonth || ''}
              onChange={(e) =>
                onUpdateProfile({
                  paydayDayOfMonth: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })
              }
              placeholder="Ex. 28 pour le 28 du mois"
              className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Currency & Language Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Devise principale</label>
            <select
              value={profile.preferredCurrency}
              onChange={(e) => onUpdateProfile({ preferredCurrency: e.target.value })}
              className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="DZD">Dinar Algérien (DZD / DA)</option>
              <option value="EUR">Euro (€)</option>
              <option value="USD">Dollar US ($)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Langue & Format</label>
            <select
              value={profile.locale}
              onChange={(e) => onUpdateProfile({ locale: e.target.value as 'ar' | 'fr' | 'en' })}
              className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="fr">Français (FR)</option>
              <option value="ar">العربية (RTL)</option>
              <option value="en">English (US)</option>
            </select>
          </div>
        </div>
      </section>

      {/* 2. Accounts Management */}
      <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Comptes de trésorerie ({accounts.length})</h2>
              <p className="text-[11px] text-slate-400">Gérez vos portefeuilles et comptes suivis.</p>
            </div>
          </div>

          <button
            onClick={() => setShowAddAccount(!showAddAccount)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition min-h-[44px] cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Ajouter compte</span>
          </button>
        </div>

        {/* Add Account Form */}
        {showAddAccount && (
          <form
            onSubmit={handleSaveAccount}
            className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3"
          >
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nom du compte</label>
              <input
                type="text"
                placeholder="Ex. Compte BNA, Portefeuille..."
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                required
                className="w-full h-11 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Type de compte</label>
                <select
                  value={newAccType}
                  onChange={(e) => setNewAccType(e.target.value as Account['type'])}
                  className="w-full h-11 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="cash">Espèces (Cash)</option>
                  <option value="bank">Compte Bancaire / CCP</option>
                  <option value="savings">Épargne</option>
                  <option value="other">Autre</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Solde initial</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={newAccBalanceStr}
                  onChange={(e) => setNewAccBalanceStr(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs cursor-pointer min-h-[44px]"
              >
                Créer le compte
              </button>
              <button
                type="button"
                onClick={() => setShowAddAccount(false)}
                className="px-4 h-11 rounded-xl border border-slate-800 text-slate-400 text-xs min-h-[44px]"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        {/* Existing Accounts List */}
        <div className="divide-y divide-slate-800/80 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
          {accounts.map((acc) => (
            <div key={acc.id} className="p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">{acc.name}</span>
                <span className="text-[11px] text-slate-500 uppercase">{acc.type}</span>
              </div>
              <span className="text-xs font-bold font-mono-numbers text-slate-300">
                Solde init.: {formatMoney(acc.initialBalanceMinor, acc.currency, profile.locale)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 2b. Universal AI Advisor & BYOK Configuration */}
      <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-950/60 text-blue-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Coach IA & BYOK Universel</h2>
              <p className="text-[11px] text-slate-400">
                Compatible avec tous les fournisseurs d'IA (Google, OpenAI, Claude, DeepSeek, Groq, Mistral, OpenRouter ou local).
              </p>
            </div>
          </div>
          <span
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
              aiMode === 'byok'
                ? 'bg-blue-950/60 border-blue-800 text-blue-300'
                : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
            }`}
          >
            {aiMode === 'byok' ? 'Mode BYOK Actif' : 'Modèle Géré (Crédits)'}
          </span>
        </div>

        {/* Mode selector buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleAIModeChange('managed')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer min-h-[44px] ${
              aiMode === 'managed'
                ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300 shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-xs font-bold block">1. Modèle Géré</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Crédits prépayés sur la plateforme
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleAIModeChange('byok')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer min-h-[44px] ${
              aiMode === 'byok'
                ? 'bg-blue-950/60 border-blue-700/80 text-blue-300 shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-xs font-bold block">2. Mode BYOK Universel</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Apportez n'importe quelle clé API (0 crédit déduit)
            </span>
          </button>
        </div>

        {/* BYOK Configuration Form */}
        {aiMode === 'byok' && (
          <div className="space-y-3.5 p-4 rounded-xl bg-slate-950 border border-slate-800">
            {/* Provider selection */}
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
                <option value="groq">Groq Cloud (Llama 3.3 70B, Mixtral — Ultra-Rapide)</option>
                <option value="mistral">Mistral AI (Mistral Small, Large, Codestral)</option>
                <option value="openrouter">OpenRouter (+100 modèles unifiés)</option>
                <option value="perplexity">Perplexity (Sonar, Sonar Pro — Recherche web)</option>
                <option value="custom">Endpoint Personnalisé / Local (Ollama, LM Studio, vLLM, Privé)</option>
              </select>
            </div>

            {/* API Key */}
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

            {/* Model & suggestions */}
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

            {/* Custom base URL */}
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
              </div>
            )}

            {/* Test button */}
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
          </div>
        )}
      </section>

      {/* 3. Security, Sync & Data Ownership (Consumer View) */}
      <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-950/60 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Sécurité & Sauvegarde des données</h2>
            <p className="text-[11px] text-slate-400">
              Vos informations financières restent privées et protégées.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <span className="text-xs font-semibold text-slate-200 block">
                Exporter mes données (CSV)
              </span>
              <span className="text-[11px] text-slate-500">
                Télécharger l'intégralité de vos opérations au format standard RFC-4180.
              </span>
            </div>
            <button
              onClick={onExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition min-h-[44px] cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exporter</span>
            </button>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-950/20 border border-rose-900/40">
            <div>
              <span className="text-xs font-semibold text-rose-300 block">
                Supprimer toutes mes données
              </span>
              <span className="text-[11px] text-rose-400/80">
                Efface définitivement l'historique et les comptes de cet appareil.
              </span>
            </div>
            <button
              onClick={() => setShowWipeConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-medium transition min-h-[44px] cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Effacer</span>
            </button>
          </div>
        </div>
      </section>

      {/* 4. Operator / Administrator Access (Quiet, Non-intrusive) */}
      <div className="pt-2 text-center">
        <button
          onClick={() => setShowAdminModal(true)}
          className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors inline-flex items-center gap-1.5 py-2 px-3 rounded-lg hover:bg-slate-900 cursor-pointer min-h-[44px]"
        >
          <Lock className="w-3 h-3" />
          <span>Console d'administration système</span>
        </button>
      </div>

      {/* Admin Dashboard Modal */}
      <AdminDashboardModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        businesses={businesses}
        documents={documents}
        reports={reports}
        onReviewBusiness={onReviewBusiness}
        onResolveReport={onResolveReport}
      />

      {/* Confirm Wipe Modal */}
      {showWipeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100">Confirmer la suppression</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Êtes-vous certain de vouloir réinitialiser l'application ? Toutes vos données
              financières enregistrées localement seront effacées.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  onWipeData();
                  setShowWipeConfirm(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs cursor-pointer min-h-[44px]"
              >
                Confirmer l'effacement
              </button>
              <button
                onClick={() => setShowWipeConfirm(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-300 text-xs min-h-[44px]"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
