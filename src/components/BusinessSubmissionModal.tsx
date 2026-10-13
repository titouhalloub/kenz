import React, { useState } from 'react';
import { X, Upload, FileText, Shield, AlertCircle, Check } from 'lucide-react';
import { Business } from '../domain/types';

interface BusinessSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    data: Omit<Business, 'id' | 'verificationStatus' | 'createdAt' | 'documentsCount'>,
    documentFiles: Array<{ documentType: string; fileName: string; fileSizeBytes: number; mimeType: string }>
  ) => void;
}

export const BusinessSubmissionModal: React.FC<BusinessSubmissionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Plomberie & Dépannage');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [addressText, setAddressText] = useState('');
  const [city, setCity] = useState('Alger');
  const [openingHours, setOpeningHours] = useState('08:00 - 18:00');
  const [error, setError] = useState('');

  // Private document upload state
  const [docType, setDocType] = useState('Registre de Commerce (CNRC)');
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ documentType: string; fileName: string; fileSizeBytes: number; mimeType: string }>
  >([]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Le fichier dépasse la taille maximale autorisée (5 Mo).');
      return;
    }

    // Validate type
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      setError('Format non supporté. Seuls PDF, JPG et PNG sont autorisés.');
      return;
    }

    setError('');
    setUploadedFiles([
      ...uploadedFiles,
      {
        documentType: docType,
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type,
      },
    ]);
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, idx) => idx !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !addressText.trim()) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    // Default coords in central Algiers if not Geocoded
    const lat = 36.7538 + (Math.random() - 0.5) * 0.05;
    const lng = 3.0588 + (Math.random() - 0.5) * 0.05;

    onSubmit(
      {
        ownerId: 'usr_local_owner',
        name: name.trim(),
        category,
        description: description.trim(),
        phone: phone.trim(),
        addressText: addressText.trim(),
        city,
        latitude: lat,
        longitude: lng,
        openingHours,
        lastConfirmedDate: new Date().toISOString().split('T')[0],
        isPublished: true,
      },
      uploadedFiles
    );

    // Reset and close
    setName('');
    setDescription('');
    setPhone('');
    setAddressText('');
    setUploadedFiles([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-100">Inscrire un commerce ou service</h2>
            <p className="text-[11px] text-slate-400">
              Publication dans l'annuaire local et dépôt de documents de vérification.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 text-xs text-rose-300 bg-rose-950/60 border border-rose-800/80 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Nom de l'établissement / Artisan *
            </label>
            <input
              type="text"
              placeholder="Ex. Plomberie Express El Harrach"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Catégorie d'activité</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="Plomberie & Dépannage">Plomberie & Dépannage</option>
                <option value="Alimentation & Épicerie">Alimentation & Épicerie</option>
                <option value="Santé & Pharmacie">Santé & Pharmacie</option>
                <option value="Mécanique & Entretien">Mécanique & Entretien</option>
                <option value="Électricité & Dépannage">Électricité & Dépannage</option>
                <option value="Boulangerie & Pâtisserie">Boulangerie & Pâtisserie</option>
                <option value="Autre service">Autre service</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Téléphone de contact *</label>
              <input
                type="tel"
                placeholder="Ex. +213 555 12 34 56"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono-numbers text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Adresse physique *</label>
              <input
                type="text"
                placeholder="Ex. 12 Rue Hassiba Ben Bouali"
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                required
                className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Ville / Wilaya</label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="Alger">Alger</option>
                <option value="Oran">Oran</option>
                <option value="Constantine">Constantine</option>
                <option value="Blida">Blida</option>
                <option value="Annaba">Annaba</option>
                <option value="Autre">Autre Wilaya</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Horaires d'ouverture</label>
            <input
              type="text"
              placeholder="Ex. 08:00 - 19:00 (Sam - Jeu)"
              value={openingHours}
              onChange={(e) => setOpeningHours(e.target.value)}
              className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Description & Services</label>
            <textarea
              rows={2}
              placeholder="Détaillez vos prestations, tarifs habituels ou spécialités..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Private Verification Document Upload Section */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">
                Documents de vérification (Strictement confidentiels)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Pour obtenir le badge de conformité <em>« Documents vérifiés »</em>, téléversez votre
              registre du commerce (CNRC) ou votre carte artisanale. Ces fichiers restent privés et
              ne sont jamais publiés.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="flex-1 h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200"
              >
                <option value="Registre de Commerce (CNRC)">Registre de Commerce (CNRC)</option>
                <option value="Agrément / Carte Professionnelle">Agrément / Carte Pro</option>
                <option value="Carte Fiscale (NIF)">Carte Fiscale (NIF)</option>
              </select>

              <label className="h-10 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition">
                <Upload className="w-3.5 h-3.5" />
                <span>Sélectionner fichier</span>
                <input
                  type="file"
                  accept=".pdf,image/png,image/jpeg"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {uploadedFiles.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="font-medium text-slate-200 truncate">{doc.fileName}</span>
                      <span className="text-[11px] text-slate-500">({doc.documentType})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      className="text-slate-500 hover:text-rose-400 p-1 min-h-[32px] flex items-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="submit"
              className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-950/40 cursor-pointer min-h-[44px]"
            >
              Publier et Soumettre à l'examen
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-12 rounded-xl border border-slate-800 text-slate-400 text-xs min-h-[44px]"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
