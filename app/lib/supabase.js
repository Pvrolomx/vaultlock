import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let _client = null

export function getSupabase() {
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseKey)
  }
  return _client
}

// Save encrypted vault blob to Supabase
// vault_id is derived from hash of master password (anonymous identifier)
export async function syncVaultToCloud(vaultId, encryptedBlob, saltB64) {
  const sb = getSupabase()
  const { error } = await sb
    .from('vaults')
    .upsert(
      { vault_id: vaultId, blob: encryptedBlob, salt: saltB64, updated_at: new Date().toISOString() },
      { onConflict: 'vault_id' }
    )
  if (error) throw error
}

// Load encrypted vault blob from Supabase
export async function loadVaultFromCloud(vaultId) {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('vaults')
    .select('blob, salt, updated_at')
    .eq('vault_id', vaultId)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null // not found
    throw error
  }
  return data
}

// Delete vault from cloud
export async function deleteVaultFromCloud(vaultId) {
  const sb = getSupabase()
  const { error } = await sb
    .from('vaults')
    .delete()
    .eq('vault_id', vaultId)
  if (error) throw error
}
