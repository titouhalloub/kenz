import React, { useState } from 'react';
import { X, Lock, Mail, User as UserIcon, MapPin, Globe, Sparkles, AlertCircle } from 'lucide-react';
import { loginUser, registerUser, UserProfile } from '../services/authStore';
import { ALGERIA_WILAYAS } from '../domain/wilayas';
import { GLOBAL_COUNTRIES } from '../domain/countries';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('Algérie (DZ)');
  const [wilaya, setWilaya] = useState('16 - Alger');
  const [region, setRegion] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        if (!fullName.trim()) {
          setError('Veuillez entrer votre nom complet.');
          setLoading(false);
          return;
        }
        const res = await registerUser(email, password, fullName, country, wilaya, region);
        if (res.success && res.user) {
          onLoginSuccess(res.user);
          onClose();
        } else {
          setError(res.error || "Erreur lors de l'inscription.");
        }
      } else {
        const res = await loginUser(email, password);
        if (res.success && res.user) {
          onLoginSuccess(res.user);
          onClose();
        } else {
          setError(res.error || 'Email ou mot de passe incorrect.');
        }
      }
    } catch {
      setError("Une erreur s'est produite.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    const res = await loginUser('citoyen@kenz.dz', 'demopass123');
    if (res.success && res.user) {
      onLoginSuccess(res.user);
      onClose();
    }
  };

  const isAlgeria = country.includes('Algérie');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 sm:p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{isRegister ? 'Créer un compte Kenz' : 'Connexion à Kenz'}</h2>
              <p className="text-xs text-slate-400">Gestion financière personnelle & solidaire (Algérie & International)</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center space-x-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nom complet</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Amine Benali"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-10 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Pays de résidence</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-10 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 appearance-none cursor-pointer"
                    >
                      {GLOBAL_COUNTRIES.map((c) => (
                        <option key={c.code} value={`${c.flag} ${c.name} (${c.code})`}>
                          {c.flag} {c.name} ({c.code}) {c.code === 'DZ' ? '— Recommandé / Premier' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {isAlgeria ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Wilaya (69 Wilayas officielles)</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                      <select
                        value={wilaya}
                        onChange={(e) => setWilaya(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-10 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 appearance-none cursor-pointer max-h-48"
                      >
                        {ALGERIA_WILAYAS.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Région / Département / État</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        placeholder="Ex. Île-de-France (75) ou Bruxelles"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-10 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Adresse Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre.email@domaine.dz"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-10 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-10 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Patientez...' : isRegister ? "S'inscrire" : 'Se connecter'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-slate-800 text-center space-y-3">
            <button
              type="button"
              onClick={handleDemoLogin}
              className="text-xs text-amber-400 hover:text-amber-300 underline cursor-pointer"
            >
              Connexion rapide (Mode Démo Citoyen)
            </button>

            <div>
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                {isRegister ? 'Déjà un compte ? Se connecter' : "Pas encore de compte ? S'inscrire"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
