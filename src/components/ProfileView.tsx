import React, { useState } from 'react';
import { UserProfile, updateUserProfile } from '../services/authStore';
import { User, Mail, MapPin, Globe, ShieldCheck, LogOut, Check, Sparkles, Calendar, Camera, Upload, AlertCircle } from 'lucide-react';
import { ALGERIA_WILAYAS } from '../domain/wilayas';
import { GLOBAL_COUNTRIES } from '../domain/countries';

interface ProfileViewProps {
  user: UserProfile;
  onUpdateUser: (user: UserProfile) => void;
  onLogout: () => void;
  onClose?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user, onUpdateUser, onLogout }) => {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [country, setCountry] = useState(user.country || 'Algérie (DZ)');
  const [wilaya, setWilaya] = useState(user.wilaya || '16 - Alger');
  const [region, setRegion] = useState(user.region || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("L'image est trop volumineuse (max 2 Mo).");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setAvatarUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const isAlgeria = country.includes('Algérie');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await updateUserProfile(user, {
        email,
        fullName,
        country,
        wilaya: isAlgeria ? wilaya : 'International / EU',
        region: isAlgeria ? undefined : region,
        avatarUrl: avatarUrl.trim() || undefined,
      });

      if (res.success && res.user) {
        onUpdateUser(res.user);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(res.error || "Erreur lors de la mise à jour du profil.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de mise à jour");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Hidden file input for uploading profile picture */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Header Profile Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 relative z-10">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-black text-3xl shadow-xl shadow-amber-500/20 overflow-hidden relative group cursor-pointer"
            title="Cliquez pour changer votre photo de profil"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover group-hover:opacity-75 transition" />
            ) : (
              <span className="group-hover:opacity-75 transition">{fullName ? fullName.charAt(0).toUpperCase() : 'U'}</span>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white text-[10px] font-bold">
              <Camera className="w-6 h-6 mb-0.5 text-amber-300" />
              <span>Modifier</span>
            </div>
          </div>
          <div className="text-center sm:text-left flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h1 className="text-2xl font-black text-white">{user.fullName}</h1>
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-full text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{user.membershipTier}</span>
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1 flex items-center justify-center sm:justify-start space-x-1.5">
              <Mail className="w-4 h-4 text-slate-500" />
              <span>{user.email}</span>
            </p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-4 text-xs text-slate-400">
              <div className="flex items-center space-x-1 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <Globe className="w-3.5 h-3.5 text-amber-400" />
                <span>{country}</span>
              </div>
              <div className="flex items-center space-x-1 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAlgeria ? wilaya : (region || 'Région EU / International')}</span>
              </div>
              <div className="flex items-center space-x-1 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Membre depuis {new Date(user.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Form & Account Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center space-x-2">
            <User className="w-5 h-5 text-amber-400" />
            <span>Informations du Profil</span>
          </h2>

          {saved && (
            <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center space-x-2 text-emerald-400 text-sm">
              <Check className="w-4 h-4 shrink-0" />
              <span>Modifications enregistrées avec succès !</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center space-x-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Nom Complet</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Photo de profil</label>
              <div className="flex items-center space-x-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center space-x-2 transition cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Télécharger une photo depuis l'appareil</span>
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Supprimer la photo
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Vous pouvez aussi cliquer directement sur votre avatar en haut. Formats acceptés : JPG, PNG (max 2 Mo).</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Adresse Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">Modifiable (synchronisée avec le profil cloud et local).</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Pays de résidence</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {GLOBAL_COUNTRIES.map((c) => (
                  <option key={c.code} value={`${c.flag} ${c.name} (${c.code})`}>
                    {c.flag} {c.name} ({c.code}) {c.code === 'DZ' ? '— Recommandé / Premier' : ''}
                  </option>
                ))}
              </select>
            </div>

            {isAlgeria ? (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Wilaya (69 Wilayas officielles)</label>
                <select
                  value={wilaya}
                  onChange={(e) => setWilaya(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {ALGERIA_WILAYAS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Région / Département / État</label>
                <input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="Ex. Île-de-France (75) ou Bruxelles"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            <div className="pt-4 flex items-center justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                Mettre à jour
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar Status & Logout */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Sécurité & Abonnement</span>
            </h3>
            <ul className="space-y-3 text-xs text-slate-300">
              <li className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span>Statut cloud</span>
                <span className="text-emerald-400 font-bold">Actif (Chiffré Sécurisé)</span>
              </li>
              <li className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span>Chiffrement local</span>
                <span className="text-emerald-400 font-bold">Protégé</span>
              </li>
            </ul>
          </div>

          <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-red-400 mb-2">Session</h3>
            <p className="text-xs text-slate-400 mb-4">Se déconnecter de la session active sur cet appareil.</p>
            <button
              onClick={onLogout}
              className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition shadow-lg shadow-red-500/20 flex items-center justify-center space-x-2 cursor-pointer text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span>Se déconnecter</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
