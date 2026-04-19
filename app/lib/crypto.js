// VaultLock Crypto Engine - AES-256-GCM + PBKDF2
// Zero-knowledge: master password never stored, never sent to server

const ITERATIONS = 310000 // OWASP 2023 recommendation
const SALT_LENGTH = 32
const IV_LENGTH = 12
const KEY_LENGTH = 256

export async function generateSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  return btoa(String.fromCharCode(...salt))
}

export async function deriveKey(masterPassword, saltB64) {
  const enc = new TextEncoder()
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0))
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(masterPassword), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encrypt(data, key) {
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  )
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

export async function decrypt(encryptedB64, key) {
  const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0))
  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return JSON.parse(new TextDecoder().decode(plaintext))
}

export function hashPassword(password) {
  // Fast check hash for unlock verification (not for encryption)
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(password + '_vaultlock_v2'))
    .then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))))
}
