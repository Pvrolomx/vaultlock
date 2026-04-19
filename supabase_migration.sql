-- VaultLock v2: encrypted vault storage
-- Zero-knowledge: blob is AES-256-GCM ciphertext, server never sees plaintext

create table if not exists vaults (
  vault_id  text primary key,          -- SHA-256 hash of (masterPassword + '_vault_id')
  blob      text not null,             -- AES-256-GCM encrypted JSON, base64
  salt      text not null,             -- PBKDF2 salt, base64
  updated_at timestamptz default now()
);

-- No auth required: vault_id is anonymous, blob is worthless without master password
alter table vaults enable row level security;

create policy "anyone can upsert their vault"
  on vaults for all
  using (true)
  with check (true);
