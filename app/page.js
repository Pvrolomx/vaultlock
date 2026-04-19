'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { generateSalt, deriveKey, encrypt, decrypt, hashPassword } from './lib/crypto'
import { syncVaultToCloud, loadVaultFromCloud } from './lib/supabase'

const CATEGORIES = [
  { id: 'bank', label: 'Bancos', icon: '🏦' },
  { id: 'email', label: 'Email', icon: '📧' },
  { id: 'social', label: 'Redes', icon: '📱' },
  { id: 'work', label: 'Trabajo', icon: '💼' },
  { id: 'gov', label: 'Gobierno', icon: '🏛️' },
  { id: 'crypto', label: 'Crypto', icon: '₿' },
  { id: 'home', label: 'Casa', icon: '🏠' },
  { id: 'shopping', label: 'Compras', icon: '🛒' },
  { id: 'travel', label: 'Viajes', icon: '✈️' },
  { id: 'health', label: 'Salud', icon: '🏥' },
  { id: 'legal', label: 'Legal', icon: '⚖️' },
  { id: 'other', label: 'Otro', icon: '📁' },
]

const AUTO_LOCK = 8 * 60 * 1000 // 8 min

// ─── Password Generator ────────────────────────────────────────────────────
function generatePassword(length = 20, opts = { upper: true, lower: true, numbers: true, symbols: true }) {
  let chars = ''
  if (opts.upper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (opts.lower) chars += 'abcdefghijklmnopqrstuvwxyz'
  if (opts.numbers) chars += '0123456789'
  if (opts.symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?'
  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz'
  const arr = new Uint32Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(n => chars[n % chars.length]).join('')
}

function passwordStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: '' }
  let score = 0
  if (pwd.length >= 12) score++
  if (pwd.length >= 20) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[a-z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  if (score <= 2) return { score, label: 'Débil', color: '#ff4444' }
  if (score <= 4) return { score, label: 'Media', color: '#ffaa00' }
  return { score, label: 'Fuerte', color: '#44ff88' }
}

// ─── Copied Toast ───────────────────────────────────────────────────────────
function Toast({ msg, visible }) {
  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%', transform: `translateX(-50%) translateY(${visible ? 0 : 20}px)`,
      background: 'var(--accent)', color: '#000', padding: '10px 24px',
      borderRadius: 100, fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
      opacity: visible ? 1 : 0, transition: 'all 0.2s ease', pointerEvents: 'none',
      zIndex: 1000, whiteSpace: 'nowrap',
    }}>
      {msg}
    </div>
  )
}

// ─── Input component ────────────────────────────────────────────────────────
function Input({ label, value, onChange, type = 'text', placeholder, autoFocus, onKeyDown }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        style={{
          background: 'var(--bg3)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '12px 16px', color: 'var(--text)',
          fontFamily: 'var(--mono)', fontSize: 14, outline: 'none',
          transition: 'border-color 0.2s',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}

// ─── Setup Screen ───────────────────────────────────────────────────────────
function SetupScreen({ onSetup }) {
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSetup() {
    if (pwd.length < 8) return setError('Mínimo 8 caracteres')
    if (pwd !== confirm) return setError('Las contraseñas no coinciden')
    setLoading(true)
    setError('')
    try {
      await onSetup(pwd)
    } catch (e) {
      setError('Error al crear la bóveda: ' + e.message)
      setLoading(false)
    }
  }

  const str = passwordStrength(pwd)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, animation: 'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.3em', color: 'var(--text3)', marginBottom: 16, textTransform: 'uppercase' }}>
            VaultLock v2
          </div>
          <div style={{ fontSize: 42, marginBottom: 12 }}>🔐</div>
          <h1 style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 28, color: 'var(--text)', marginBottom: 8 }}>
            Crear Bóveda
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 }}>
            Elige tu master password. Sin ella, tus datos son ilegibles — ni Supabase los puede ver.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input label="Master Password" type="password" value={pwd} onChange={setPwd} autoFocus
            onKeyDown={e => e.key === 'Enter' && document.querySelector('#confirm-input')?.focus()} />
          
          {pwd && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 3, background: 'var(--bg4)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${(str.score / 6) * 100}%`, height: '100%', background: str.color, borderRadius: 2, transition: 'all 0.3s' }} />
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: str.color }}>{str.label}</span>
            </div>
          )}

          <div id="confirm-input">
            <Input label="Confirmar" type="password" value={confirm} onChange={setConfirm}
              onKeyDown={e => e.key === 'Enter' && handleSetup()} />
          </div>

          {error && <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)', padding: '10px 14px', background: 'rgba(255,68,68,0.08)', borderRadius: 6, border: '1px solid rgba(255,68,68,0.2)' }}>{error}</div>}

          <button onClick={handleSetup} disabled={loading} style={{
            background: loading ? 'var(--bg4)' : 'var(--accent)', color: '#000',
            border: 'none', borderRadius: 10, padding: '14px 24px',
            fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, cursor: loading ? 'default' : 'pointer',
            marginTop: 8, transition: 'all 0.2s',
            ...(loading ? {} : { animation: 'pulse-glow 2s ease infinite' }),
          }}>
            {loading ? 'Cifrando...' : 'Crear Bóveda →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Unlock Screen ──────────────────────────────────────────────────────────
function UnlockScreen({ onUnlock, onReset, onNewVault }) {
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleUnlock() {
    if (!pwd) return setError('Ingresa tu master password')
    setLoading(true)
    setError('')
    try {
      await onUnlock(pwd)
    } catch (e) {
      setError(e.message === 'Wrong password' ? 'Master password incorrecta' : e.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360, animation: 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 26, marginBottom: 8 }}>VaultLock</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>Ingresa tu master password</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input type="password" value={pwd} onChange={setPwd} autoFocus placeholder="••••••••••••"
            onKeyDown={e => e.key === 'Enter' && handleUnlock()} />

          {error && <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)', textAlign: 'center' }}>{error}</div>}

          <button onClick={handleUnlock} disabled={loading} style={{
            background: loading ? 'var(--bg4)' : 'var(--accent)', color: '#000',
            border: 'none', borderRadius: 10, padding: '14px', width: '100%',
            fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            transition: 'all 0.2s',
          }}>
            {loading ? 'Abriendo...' : 'Abrir →'}
          </button>

          <button onClick={onNewVault} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer',
            padding: '10px', marginTop: 4,
          }}>
            + Crear bóveda nueva
          </button>

          <button onClick={onReset} style={{
            background: 'none', border: 'none', color: 'var(--text3)',
            fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer',
            textDecoration: 'underline', marginTop: 4,
          }}>
            ¿Olvidaste tu contraseña? (destruir bóveda)
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Entry Modal ────────────────────────────────────────────────────────────
function EntryModal({ entry, onSave, onClose, onDelete }) {
  const isNew = !entry.id
  const [form, setForm] = useState({
    name: entry.name || '',
    username: entry.username || '',
    password: entry.password || '',
    url: entry.url || '',
    category: entry.category || 'other',
    notes: entry.notes || '',
  })
  const [showPwd, setShowPwd] = useState(false)
  const [genOpts, setGenOpts] = useState({ length: 20, upper: true, lower: true, numbers: true, symbols: true })
  const [showGen, setShowGen] = useState(false)
  const [copied, setCopied] = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function copy(val, label) {
    navigator.clipboard.writeText(val)
    setCopied(label)
    setTimeout(() => setCopied(''), 1500)
  }

  function generate() {
    const pwd = generatePassword(genOpts.length, genOpts)
    set('password', pwd)
  }

  const str = passwordStrength(form.password)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 100, backdropFilter: 'blur(4px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520,
        maxHeight: '92vh', overflow: 'auto', padding: 24,
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 20 }}>
            {isNew ? 'Nueva entrada' : 'Editar entrada'}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isNew && (
              <button onClick={onDelete} style={{
                background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.2)',
                borderRadius: 8, padding: '6px 12px', color: 'var(--red)',
                fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer',
              }}>Eliminar</button>
            )}
            <button onClick={onClose} style={{
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 12px', color: 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer',
            }}>✕</button>
          </div>
        </div>

        {/* Category selector */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Categoría</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map(c => (
              <button key={c.id} onClick={() => set('category', c.id)} style={{
                background: form.category === c.id ? 'rgba(212,255,0,0.15)' : 'var(--bg3)',
                border: `1px solid ${form.category === c.id ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 20, padding: '5px 12px', cursor: 'pointer',
                fontFamily: 'var(--sans)', fontSize: 13, color: form.category === c.id ? 'var(--accent)' : 'var(--text2)',
                transition: 'all 0.15s',
              }}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Nombre *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              onInput={e => set('name', e.target.value)}
              placeholder="Netflix, BBVA, Gmail..."
              style={{
                background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '12px 16px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 14, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>

          {/* Username */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Usuario / Email</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={form.username} onChange={e => set('username', e.target.value)} style={{
                flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '12px 16px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 14, outline: 'none',
              }}
                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              <button onClick={() => copy(form.username, 'usuario')} style={{
                background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '0 14px', color: copied === 'usuario' ? 'var(--accent)' : 'var(--text2)',
                cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap',
              }}>{copied === 'usuario' ? '✓' : 'copiar'}</button>
            </div>
          </div>

          {/* Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Contraseña</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input type={showPwd ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)}
                  style={{
                    width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                    padding: '12px 44px 12px 16px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 14, outline: 'none',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                <button onClick={() => setShowPwd(s => !s)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16,
                }}>{showPwd ? '🙈' : '👁️'}</button>
              </div>
              <button onClick={() => copy(form.password, 'pwd')} style={{
                background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '0 14px', color: copied === 'pwd' ? 'var(--accent)' : 'var(--text2)',
                cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12,
              }}>{copied === 'pwd' ? '✓' : 'copiar'}</button>
              <button onClick={() => setShowGen(s => !s)} style={{
                background: showGen ? 'rgba(212,255,0,0.1)' : 'var(--bg3)',
                border: `1px solid ${showGen ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8, padding: '0 14px',
                color: showGen ? 'var(--accent)' : 'var(--text2)',
                cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12,
              }}>gen</button>
            </div>

            {/* Strength bar */}
            {form.password && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <div style={{ flex: 1, height: 2, background: 'var(--bg4)', borderRadius: 1 }}>
                  <div style={{ width: `${(str.score / 6) * 100}%`, height: '100%', background: str.color, borderRadius: 1, transition: 'all 0.3s' }} />
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: str.color }}>{str.label}</span>
              </div>
            )}

            {/* Generator */}
            {showGen && (
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>Longitud: {genOpts.length}</span>
                  <input type="range" min={8} max={64} value={genOpts.length}
                    onChange={e => setGenOpts(o => ({ ...o, length: +e.target.value }))}
                    style={{ flex: 1, accentColor: 'var(--accent)' }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {[['upper', 'A-Z'], ['lower', 'a-z'], ['numbers', '0-9'], ['symbols', '!@#']].map(([k, lbl]) => (
                    <button key={k} onClick={() => setGenOpts(o => ({ ...o, [k]: !o[k] }))} style={{
                      background: genOpts[k] ? 'rgba(212,255,0,0.1)' : 'var(--bg4)',
                      border: `1px solid ${genOpts[k] ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                      fontFamily: 'var(--mono)', fontSize: 12,
                      color: genOpts[k] ? 'var(--accent)' : 'var(--text3)',
                    }}>{lbl}</button>
                  ))}
                </div>
                <button onClick={generate} style={{
                  background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
                  padding: '8px 16px', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%',
                }}>Generar contraseña</button>
              </div>
            )}
          </div>

          {/* URL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>URL</label>
            <input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://..." style={{
              background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '12px 16px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 14, outline: 'none',
            }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>

          {/* Notes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Notas</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Notas opcionales..." style={{
              background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '12px 16px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 14, outline: 'none',
              resize: 'vertical',
            }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>

          <button
            onClick={() => onSave(form)}
            disabled={!form.name.trim()}
            style={{
              background: form.name.trim() ? 'var(--accent)' : 'var(--bg4)',
              color: form.name.trim() ? '#000' : 'var(--text3)', border: 'none', borderRadius: 10,
              padding: '14px', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14,
              cursor: form.name.trim() ? 'pointer' : 'default', marginTop: 8, transition: 'all 0.2s',
              opacity: form.name.trim() ? 1 : 0.5,
            }}>
            {isNew ? 'Guardar entrada' : 'Actualizar'} {form.name.trim() ? '→' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Vault Screen ──────────────────────────────────────────────────────
function VaultScreen({ entries, onAdd, onEdit, onLock, syncStatus, onSync, onImport, importing }) {
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [copiedId, setCopiedId] = useState(null)

  function copy(val, id) {
    navigator.clipboard.writeText(val)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const filtered = entries.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = !q || e.name.toLowerCase().includes(q) || e.username?.toLowerCase().includes(q) || e.url?.toLowerCase().includes(q)
    const matchCat = filterCat === 'all' || e.category === filterCat
    return matchSearch && matchCat
  })

  const usedCats = ['all', ...CATEGORIES.filter(c => entries.some(e => e.category === c.id)).map(c => c.id)]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, background: 'rgba(8,8,8,0.95)',
        backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)',
        padding: '16px 20px', zIndex: 10,
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>🔐</span>
              <div>
                <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>VaultLock</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{entries.length} entradas</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {entries.length < 10 && (
                <button onClick={onImport} disabled={importing} title="Importar PASSWORDS 6" style={{
                  background: importing ? 'var(--bg3)' : 'rgba(212,255,0,0.1)',
                  border: '1px solid rgba(212,255,0,0.3)', borderRadius: 8,
                  padding: '7px 10px', cursor: importing ? 'default' : 'pointer',
                  color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11,
                }}>
                  {importing ? '⟳' : '📥'}
                </button>
              )}
              <button onClick={onSync} title="Sincronizar" style={{
                background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '7px 12px', cursor: 'pointer', fontSize: 16,
                color: syncStatus === 'ok' ? 'var(--green)' : syncStatus === 'syncing' ? 'var(--accent)' : 'var(--text2)',
              }}>
                {syncStatus === 'syncing' ? '⟳' : syncStatus === 'ok' ? '✓' : '☁'}
              </button>
              <button onClick={onAdd} style={{
                background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
                padding: '7px 14px', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>+ Nueva</button>
              <button onClick={onLock} title="Bloquear" style={{
                background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '7px 12px', cursor: 'pointer', fontSize: 16, color: 'var(--text2)',
              }}>🔒</button>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: 16 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
              style={{
                width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '11px 16px 11px 42px',
                color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 14, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>

          {/* Category filter */}
          {usedCats.length > 2 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
              {usedCats.map(id => {
                const cat = id === 'all' ? { label: 'Todas', icon: '✦' } : CATEGORIES.find(c => c.id === id)
                return (
                  <button key={id} onClick={() => setFilterCat(id)} style={{
                    background: filterCat === id ? 'rgba(212,255,0,0.15)' : 'var(--bg3)',
                    border: `1px solid ${filterCat === id ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 20, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
                    fontFamily: 'var(--sans)', fontSize: 12,
                    color: filterCat === id ? 'var(--accent)' : 'var(--text2)',
                    transition: 'all 0.15s',
                  }}>{cat?.icon} {cat?.label}</button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Entry list */}
      <div style={{ flex: 1, padding: '12px 20px 80px', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🗝️</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>
              {search ? 'Sin resultados' : 'Bóveda vacía — agrega tu primera entrada'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(e => {
              const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[CATEGORIES.length - 1]
              return (
                <div key={e.id} onClick={() => onEdit(e)}
                  style={{
                    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
                    padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: 14, animation: 'fadeIn 0.2s ease forwards',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.background = 'var(--bg3)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg2)' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: 'var(--bg3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                  }}>{cat.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 15, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.username || e.url || cat.label}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={ev => ev.stopPropagation()}>
                    <button onClick={() => copy(e.username, e.id + '_u')} style={{
                      background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6,
                      padding: '5px 10px', color: copiedId === e.id + '_u' ? 'var(--accent)' : 'var(--text3)',
                      fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer',
                    }}>{copiedId === e.id + '_u' ? '✓' : 'usr'}</button>
                    <button onClick={() => copy(e.password, e.id + '_p')} style={{
                      background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6,
                      padding: '5px 10px', color: copiedId === e.id + '_p' ? 'var(--accent)' : 'var(--text3)',
                      fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer',
                    }}>{copiedId === e.id + '_p' ? '✓' : 'pwd'}</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── App Root ────────────────────────────────────────────────────────────────
export default function VaultLock() {
  const [state, setState] = useState('loading') // loading | setup | locked | unlocked
  const [entries, setEntries] = useState([])
  const [cryptoKey, setCryptoKey] = useState(null)
  const [salt, setSalt] = useState(null)
  const [vaultId, setVaultId] = useState(null)
  const [modal, setModal] = useState(null) // null | { entry }
  const [toast, setToast] = useState({ msg: '', visible: false })
  const [syncStatus, setSyncStatus] = useState('idle') // idle | syncing | ok | error
  const lockTimer = useRef(null)

  function showToast(msg) {
    setToast({ msg, visible: true })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2000)
  }

  function resetLockTimer() {
    clearTimeout(lockTimer.current)
    lockTimer.current = setTimeout(() => {
      setCryptoKey(null)
      setState('locked')
    }, AUTO_LOCK)
  }

  useEffect(() => {
    const stored = localStorage.getItem('vl2_meta')
    setState('locked')
  }, [])

  useEffect(() => {
    if (state === 'unlocked') {
      resetLockTimer()
      const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
      events.forEach(e => window.addEventListener(e, resetLockTimer))
      return () => {
        clearTimeout(lockTimer.current)
        events.forEach(e => window.removeEventListener(e, resetLockTimer))
      }
    }
  }, [state])

  // ── Setup ──────────────────────────────────────────────────────────────────
  async function handleSetup(masterPwd) {
    const newSalt = await generateSalt()
    const key = await deriveKey(masterPwd, newSalt)
    const pwdHash = await hashPassword(masterPwd)
    const vid = await hashPassword(masterPwd + '_vault_id')
    
    const encrypted = await encrypt([], key)
    localStorage.setItem('vl2_meta', JSON.stringify({ salt: newSalt, pwdHash }))
    localStorage.setItem('vl2_blob', encrypted)
    
    setSalt(newSalt)
    setCryptoKey(key)
    setVaultId(vid)
    setEntries([])
    setState('unlocked')

    // Sync initial empty vault to cloud
    try {
      await syncVaultToCloud(vid, encrypted, newSalt)
      setSyncStatus('ok')
    } catch {
      setSyncStatus('error')
    }
  }

  // ── Unlock ─────────────────────────────────────────────────────────────────
  async function handleUnlock(masterPwd) {
    const pwdHash = await hashPassword(masterPwd)
    const vid = await hashPassword(masterPwd + '_vault_id')
    let meta = JSON.parse(localStorage.getItem('vl2_meta') || '{}')

    // New device: no local meta — try to bootstrap from Supabase
    if (!meta.salt) {
      let cloud = null
      try { cloud = await loadVaultFromCloud(vid) } catch {}
      if (!cloud) throw new Error('No se encontró bóveda. Crea una nueva o sincroniza desde otro dispositivo.')
      // Verify password by trying to decrypt
      const testKey = await deriveKey(masterPwd, cloud.salt)
      try {
        await decrypt(cloud.blob, testKey)
      } catch {
        throw new Error('Wrong password')
      }
      // Bootstrap local meta
      meta = { salt: cloud.salt, pwdHash }
      localStorage.setItem('vl2_meta', JSON.stringify(meta))
      localStorage.setItem('vl2_blob', cloud.blob)
    }

    if (pwdHash !== meta.pwdHash) throw new Error('Wrong password')

    const key = await deriveKey(masterPwd, meta.salt)

    // Try to load from cloud first (latest sync wins)
    let blob = null
    let cloudSalt = meta.salt
    try {
      const cloud = await loadVaultFromCloud(vid)
      if (cloud) {
        blob = cloud.blob
        cloudSalt = cloud.salt
        localStorage.setItem('vl2_blob', blob)
      }
    } catch { /* offline, use local */ }

    if (!blob) blob = localStorage.getItem('vl2_blob')
    if (!blob) throw new Error('No vault found')

    const finalKey = cloudSalt !== meta.salt ? await deriveKey(masterPwd, cloudSalt) : key
    const decrypted = await decrypt(blob, finalKey)

    setSalt(cloudSalt)
    setCryptoKey(finalKey)
    setVaultId(vid)
    setEntries(decrypted)
    setState('unlocked')
  }

  // ── Save entries ───────────────────────────────────────────────────────────
  async function saveEntries(newEntries) {
    if (!cryptoKey) return
    const encrypted = await encrypt(newEntries, cryptoKey)
    localStorage.setItem('vl2_blob', encrypted)
    setEntries(newEntries)
    
    // Sync to cloud
    setSyncStatus('syncing')
    try {
      await syncVaultToCloud(vaultId, encrypted, salt)
      setSyncStatus('ok')
    } catch {
      setSyncStatus('error')
      showToast('⚠ Sin conexión — guardado local')
    }
  }

  // ── Entry CRUD ─────────────────────────────────────────────────────────────
  async function handleSaveEntry(form) {
    const isNew = !modal?.entry?.id
    let newEntries
    if (isNew) {
      newEntries = [...entries, { ...form, id: crypto.randomUUID(), createdAt: Date.now() }]
    } else {
      newEntries = entries.map(e => e.id === modal.entry.id ? { ...e, ...form } : e)
    }
    await saveEntries(newEntries)
    setModal(null)
    showToast(isNew ? '✓ Guardado' : '✓ Actualizado')
  }

  async function handleDeleteEntry() {
    const newEntries = entries.filter(e => e.id !== modal.entry.id)
    await saveEntries(newEntries)
    setModal(null)
    showToast('Eliminado')
  }

  // ── Manual sync ────────────────────────────────────────────────────────────
  async function handleManualSync() {
    if (!cryptoKey || !vaultId) return
    setSyncStatus('syncing')
    const blob = localStorage.getItem('vl2_blob')
    try {
      await syncVaultToCloud(vaultId, blob, salt)
      setSyncStatus('ok')
      showToast('✓ Sincronizado')
    } catch (e) {
      setSyncStatus('error')
      showToast('⚠ Error al sincronizar')
    }
  }

  // ── Import PASSWORDS 6 ─────────────────────────────────────────────────────
  const [importing, setImporting] = useState(false)
  async function handleImport() {
    if (!cryptoKey || importing) return
    setImporting(true)
    showToast('⟳ Importando...')
    try {
      const IMPORT_DATA = await fetch('/api/import-data').then(r => r.json()).catch(() => null)
      if (!IMPORT_DATA) throw new Error('No se pudo cargar datos')
      const existingNames = new Set(entries.map(e => e.name.toLowerCase()))
      const toAdd = IMPORT_DATA
        .filter(e => !existingNames.has(e.name.toLowerCase()))
        .map(e => ({ ...e, id: crypto.randomUUID(), createdAt: Date.now() }))
      const merged = [...entries, ...toAdd]
      await saveEntries(merged)
      showToast(`✅ ${toAdd.length} entradas importadas`)
    } catch(e) {
      showToast('⚠ Error: ' + e.message)
    }
    setImporting(false)
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function handleReset() {
    if (!window.confirm('⚠️ Esto destruirá tu bóveda local. ¿Estás seguro?')) return
    localStorage.removeItem('vl2_meta')
    localStorage.removeItem('vl2_blob')
    setCryptoKey(null)
    setSalt(null)
    setVaultId(null)
    setEntries([])
    setState('setup')
  }

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text3)' }}>cargando...</div>
      </div>
    )
  }

  return (
    <>
      {state === 'setup' && <SetupScreen onSetup={handleSetup} />}
      {state === 'locked' && <UnlockScreen onUnlock={handleUnlock} onReset={handleReset} onNewVault={() => setState('setup')} />}
      {state === 'unlocked' && (
        <VaultScreen
          entries={entries}
          onAdd={() => setModal({ entry: {} })}
          onEdit={e => setModal({ entry: e })}
          onLock={() => { setCryptoKey(null); setState('locked') }}
          syncStatus={syncStatus}
          onSync={handleManualSync}
          onImport={handleImport}
          importing={importing}
        />
      )}
      {modal && (
        <EntryModal
          entry={modal.entry}
          onSave={handleSaveEntry}
          onClose={() => setModal(null)}
          onDelete={handleDeleteEntry}
        />
      )}
      <Toast msg={toast.msg} visible={toast.visible} />
    </>
  )
}
