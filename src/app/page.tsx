"use client";

import { useState, useEffect, useCallback } from 'react';

// ============ CRYPTO CONSTANTS - NO TOCAR ============
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ITERATIONS = 100000;

// ============ TYPES ============
interface PasswordEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url?: string;
  category: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface VaultData {
  salt: string;
  iv: string;
  data: string;
}

type Screen = 'setup' | 'locked' | 'unlocked';

// ============ CATEGORIES ============
const CATEGORIES = [
  { id: 'social', name: 'Redes Sociales', icon: '👥' },
  { id: 'email', name: 'Email', icon: '📧' },
  { id: 'banking', name: 'Banca', icon: '🏦' },
  { id: 'shopping', name: 'Compras', icon: '🛒' },
  { id: 'work', name: 'Trabajo', icon: '💼' },
  { id: 'entertainment', name: 'Entretenimiento', icon: '🎬' },
  { id: 'gaming', name: 'Gaming', icon: '🎮' },
  { id: 'cloud', name: 'Cloud', icon: '☁️' },
  { id: 'dev', name: 'Desarrollo', icon: '💻' },
  { id: 'crypto', name: 'Crypto', icon: '₿' },
  { id: 'health', name: 'Salud', icon: '🏥' },
  { id: 'other', name: 'Otros', icon: '📁' },
];

// ============ CRYPTO FUNCTIONS - NO TOCAR ============
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(data: string, key: CryptoKey): Promise<{ iv: Uint8Array; encrypted: Uint8Array }> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encoder.encode(data)
  );
  return { iv, encrypted: new Uint8Array(encrypted) };
}

async function decrypt(encrypted: Uint8Array, key: CryptoKey, iv: Uint8Array): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}

function arrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr));
}

function base64ToArray(base64: string): Uint8Array {
  return new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
}
// ============ END CRYPTO ============

export default function VaultLock() {
  const [screen, setScreen] = useState<Screen>('locked');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [salt, setSalt] = useState<Uint8Array | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showModal, setShowModal] = useState<'view' | 'add' | 'edit' | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<PasswordEntry | null>(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  // Form state for add/edit
  const [formData, setFormData] = useState({
    title: '', username: '', password: '', url: '', category: 'other', notes: ''
  });

  // Password generator state
  const [genLength, setGenLength] = useState(16);
  const [genUpper, setGenUpper] = useState(true);
  const [genLower, setGenLower] = useState(true);
  const [genNumbers, setGenNumbers] = useState(true);
  const [genSymbols, setGenSymbols] = useState(true);

  // ============ AUTO-LOCK TIMER ============
  const resetActivity = useCallback(() => setLastActivity(Date.now()), []);

  useEffect(() => {
    if (screen !== 'unlocked') return;
    
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetActivity));
    
    const interval = setInterval(() => {
      if (Date.now() - lastActivity > 5 * 60 * 1000) {
        handleLock();
      }
    }, 10000);

    return () => {
      events.forEach(e => window.removeEventListener(e, resetActivity));
      clearInterval(interval);
    };
  }, [screen, lastActivity, resetActivity]);

  // ============ INIT ============
  useEffect(() => {
    const vault = localStorage.getItem('vaultlock-data');
    if (!vault) {
      setScreen('setup');
    } else {
      setScreen('locked');
    }

    // PWA install prompt
    const handleInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleInstall);
  }, []);

  // ============ SAVE DATA ============
  const saveData = async (entriesToSave: PasswordEntry[], key: CryptoKey, currentSalt: Uint8Array) => {
    const json = JSON.stringify(entriesToSave);
    const { iv, encrypted } = await encrypt(json, key);
    const vaultData: VaultData = {
      salt: arrayToBase64(currentSalt),
      iv: arrayToBase64(iv),
      data: arrayToBase64(encrypted),
    };
    localStorage.setItem('vaultlock-data', JSON.stringify(vaultData));
  };

  // ============ HANDLERS ============
  const handleSetup = async () => {
    if (masterPassword.length < 8) {
      setError('Mínimo 8 caracteres');
      return;
    }
    if (masterPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    
    const newSalt = generateSalt();
    const key = await deriveKey(masterPassword, newSalt);
    setSalt(newSalt);
    setCryptoKey(key);
    await saveData([], key, newSalt);
    setScreen('unlocked');
    setMasterPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleUnlock = async () => {
    try {
      const vault = localStorage.getItem('vaultlock-data');
      if (!vault) return;
      
      const vaultData: VaultData = JSON.parse(vault);
      const storedSalt = base64ToArray(vaultData.salt);
      const iv = base64ToArray(vaultData.iv);
      const encrypted = base64ToArray(vaultData.data);
      
      const key = await deriveKey(masterPassword, storedSalt);
      const decrypted = await decrypt(encrypted, key, iv);
      const loadedEntries = JSON.parse(decrypted);
      
      setSalt(storedSalt);
      setCryptoKey(key);
      setEntries(loadedEntries);
      setScreen('unlocked');
      setMasterPassword('');
      setError('');
      resetActivity();
    } catch {
      setError('Contraseña incorrecta');
    }
  };

  const handleLock = () => {
    setCryptoKey(null);
    setEntries([]);
    setScreen('locked');
    setSearch('');
    setFilterCategory('all');
    setShowModal(null);
  };

  const handleAddEntry = async () => {
    if (!formData.title || !formData.password || !cryptoKey || !salt) return;
    
    const newEntry: PasswordEntry = {
      id: Date.now().toString(),
      ...formData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const updated = [...entries, newEntry];
    setEntries(updated);
    await saveData(updated, cryptoKey, salt);
    setShowModal(null);
    resetForm();
  };

  const handleEditEntry = async () => {
    if (!selectedEntry || !cryptoKey || !salt) return;
    
    const updated = entries.map(e => 
      e.id === selectedEntry.id 
        ? { ...e, ...formData, updatedAt: new Date().toISOString() }
        : e
    );
    setEntries(updated);
    await saveData(updated, cryptoKey, salt);
    setShowModal(null);
    resetForm();
  };

  const handleDeleteEntry = async (id: string) => {
    if (!cryptoKey || !salt) return;
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated);
    await saveData(updated, cryptoKey, salt);
    setShowModal(null);
  };

  const resetForm = () => {
    setFormData({ title: '', username: '', password: '', url: '', category: 'other', notes: '' });
    setSelectedEntry(null);
  };

  const openEdit = (entry: PasswordEntry) => {
    setSelectedEntry(entry);
    setFormData({
      title: entry.title,
      username: entry.username,
      password: entry.password,
      url: entry.url || '',
      category: entry.category,
      notes: entry.notes || '',
    });
    setShowModal('edit');
  };

  const openView = (entry: PasswordEntry) => {
    setSelectedEntry(entry);
    setShowModal('view');
  };

  // ============ PASSWORD GENERATOR ============
  const generatePassword = () => {
    let chars = '';
    if (genUpper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (genLower) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (genNumbers) chars += '0123456789';
    if (genSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz';
    
    let result = '';
    const array = new Uint32Array(genLength);
    crypto.getRandomValues(array);
    for (let i = 0; i < genLength; i++) {
      result += chars[array[i] % chars.length];
    }
    setFormData({ ...formData, password: result });
  };

  // ============ COPY TO CLIPBOARD ============
  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  // ============ EXPORT BACKUP ============
  const exportBackup = () => {
    const vault = localStorage.getItem('vaultlock-data');
    if (!vault) return;
    const blob = new Blob([vault], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vaultlock-backup-${new Date().toISOString().split('T')[0]}.vault`;
    a.click();
  };

  // ============ FILTER ENTRIES ============
  const filteredEntries = entries.filter(e => {
    const matchSearch = e.title.toLowerCase().includes(search.toLowerCase()) ||
                       e.username.toLowerCase().includes(search.toLowerCase());
    const matchCategory = filterCategory === 'all' || e.category === filterCategory;
    return matchSearch && matchCategory;
  });

  // ============ RENDER ============
  return (
    <main className="min-h-screen bg-[#F5F3EF] p-4 pb-20">
      <div className="max-w-md mx-auto">
        {/* ============ SETUP SCREEN ============ */}
        {screen === 'setup' && (
          <div className="animate-fadeIn">
            <div className="text-center mb-8 pt-12">
              <div className="text-6xl mb-4">🔐</div>
              <h1 className="text-2xl font-bold text-gray-800">VaultLock</h1>
              <p className="text-gray-500 mt-2">Crea tu contraseña maestra</p>
            </div>
            
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contraseña maestra</label>
                <input
                  type="password"
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-900"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Confirmar contraseña</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-900"
                  placeholder="Repite tu contraseña"
                  onKeyDown={(e) => e.key === 'Enter' && handleSetup()}
                />
              </div>

              {error && <p className="text-red-500 text-sm animate-shake">{error}</p>}
              
              <button
                onClick={handleSetup}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
              >
                Crear Bóveda
              </button>
            </div>
            
            <p className="text-center text-xs text-gray-400 mt-6">
              Tu contraseña nunca se almacena. Se usa para derivar la clave de encriptación.
            </p>
          </div>
        )}

        {/* ============ LOCKED SCREEN ============ */}
        {screen === 'locked' && (
          <div className="animate-fadeIn">
            <div className="text-center mb-8 pt-12">
              <div className="text-6xl mb-4">🔒</div>
              <h1 className="text-2xl font-bold text-gray-800">VaultLock</h1>
              <p className="text-gray-500 mt-2">Ingresa tu contraseña maestra</p>
            </div>
            
            <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
              <input
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-900"
                placeholder="Contraseña maestra"
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              />

              {error && <p className="text-red-500 text-sm animate-shake">{error}</p>}
              
              <button
                onClick={handleUnlock}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
              >
                Desbloquear
              </button>
            </div>

            {installPrompt && (
              <button
                onClick={() => installPrompt.prompt()}
                className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <span>📲</span> Instalar App
              </button>
            )}
          </div>
        )}

        {/* ============ UNLOCKED SCREEN ============ */}
        {screen === 'unlocked' && (
          <div className="animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-gray-800">🔓 VaultLock</h1>
                <p className="text-xs text-gray-500">{entries.length} contraseñas</p>
              </div>
              <div className="flex gap-2">
                <button onClick={exportBackup} className="p-2 bg-gray-100 rounded-xl text-gray-600 hover:bg-gray-200" title="Exportar">
                  💾
                </button>
                <button onClick={handleLock} className="p-2 bg-red-50 rounded-xl text-red-600 hover:bg-red-100" title="Bloquear">
                  🔒
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-900"
                placeholder="🔍 Buscar..."
              />
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
              <button
                onClick={() => setFilterCategory('all')}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  filterCategory === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Todas
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setFilterCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                    filterCategory === cat.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>

            {/* Entries List */}
            <div className="space-y-2">
              {filteredEntries.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  {entries.length === 0 ? (
                    <>
                      <div className="text-4xl mb-2">🔐</div>
                      <p>Tu bóveda está vacía</p>
                      <p className="text-sm">Agrega tu primera contraseña</p>
                    </>
                  ) : (
                    <p>No hay resultados</p>
                  )}
                </div>
              ) : (
                filteredEntries.map(entry => {
                  const cat = CATEGORIES.find(c => c.id === entry.category);
                  return (
                    <div
                      key={entry.id}
                      onClick={() => openView(entry)}
                      className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <div className="text-2xl">{cat?.icon || '📁'}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">{entry.title}</p>
                        <p className="text-sm text-gray-500 truncate">{entry.username}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(entry.password, entry.id); }}
                        className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        {copied === entry.id ? '✅' : '📋'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add Button */}
            <button
              onClick={() => { resetForm(); setShowModal('add'); }}
              className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-colors"
            >
              +
            </button>
          </div>
        )}
        {/* ============ VIEW MODAL ============ */}
        {showModal === 'view' && selectedEntry && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto animate-fadeIn">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{CATEGORIES.find(c => c.id === selectedEntry.category)?.icon}</span>
                    <h2 className="text-xl font-bold text-gray-800">{selectedEntry.title}</h2>
                  </div>
                  <button onClick={() => setShowModal(null)} className="p-2 hover:bg-gray-100 rounded-lg">✕</button>
                </div>

                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">Usuario</p>
                    <div className="flex items-center justify-between">
                      <p className="text-gray-800 font-medium">{selectedEntry.username}</p>
                      <button
                        onClick={() => copyToClipboard(selectedEntry.username, 'user')}
                        className="text-indigo-600"
                      >
                        {copied === 'user' ? '✅' : '📋'}
                      </button>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">Contraseña</p>
                    <div className="flex items-center justify-between">
                      <p className="text-gray-800 font-mono">
                        {showPassword[selectedEntry.id] ? selectedEntry.password : '••••••••••••'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowPassword({ ...showPassword, [selectedEntry.id]: !showPassword[selectedEntry.id] })}
                          className="text-gray-600"
                        >
                          {showPassword[selectedEntry.id] ? '🙈' : '👁️'}
                        </button>
                        <button
                          onClick={() => copyToClipboard(selectedEntry.password, 'pass')}
                          className="text-indigo-600"
                        >
                          {copied === 'pass' ? '✅' : '📋'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {selectedEntry.url && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">URL</p>
                      <a href={selectedEntry.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 break-all">
                        {selectedEntry.url}
                      </a>
                    </div>
                  )}

                  {selectedEntry.notes && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Notas</p>
                      <p className="text-gray-800 whitespace-pre-wrap">{selectedEntry.notes}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => openEdit(selectedEntry)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-xl transition-colors"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => { if (confirm('¿Eliminar esta contraseña?')) handleDeleteEntry(selectedEntry.id); }}
                    className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-medium py-3 rounded-xl transition-colors"
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ ADD/EDIT MODAL ============ */}
        {(showModal === 'add' || showModal === 'edit') && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fadeIn">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-800">
                    {showModal === 'add' ? '➕ Nueva Contraseña' : '✏️ Editar Contraseña'}
                  </h2>
                  <button onClick={() => { setShowModal(null); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-lg">✕</button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-900"
                      placeholder="ej: Gmail Personal"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Usuario / Email</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-900"
                      placeholder="tu@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-900 font-mono"
                        placeholder="••••••••"
                      />
                      <button
                        onClick={generatePassword}
                        className="px-4 py-3 bg-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-200 transition-colors"
                        title="Generar"
                      >
                        🎲
                      </button>
                    </div>
                  </div>

                  {/* Password Generator Options */}
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium text-gray-700">Generador</p>
                    <div className="flex items-center gap-4">
                      <label className="text-sm text-gray-600">Longitud: {genLength}</label>
                      <input
                        type="range"
                        min="8"
                        max="32"
                        value={genLength}
                        onChange={(e) => setGenLength(parseInt(e.target.value))}
                        className="flex-1"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: 'genUpper', label: 'ABC', state: genUpper, setState: setGenUpper },
                        { key: 'genLower', label: 'abc', state: genLower, setState: setGenLower },
                        { key: 'genNumbers', label: '123', state: genNumbers, setState: setGenNumbers },
                        { key: 'genSymbols', label: '@#$', state: genSymbols, setState: setGenSymbols },
                      ].map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => opt.setState(!opt.state)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            opt.state ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-900 bg-white"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                    <input
                      type="url"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-900"
                      placeholder="https://..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-900 resize-none"
                      rows={3}
                      placeholder="Notas adicionales..."
                    />
                  </div>
                </div>

                <button
                  onClick={showModal === 'add' ? handleAddEntry : handleEditEntry}
                  disabled={!formData.title || !formData.password}
                  className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                >
                  {showModal === 'add' ? 'Guardar' : 'Actualizar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-8">
          C15 Scout | Colmena 2026
        </p>
      </div>
    </main>
  );
}
