create table if not exists public.account_vault_backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  credential_id text not null,
  prf_salt text not null,
  encrypted_envelope jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint account_vault_backups_credential_id_length
    check (length(credential_id) between 16 and 2048),
  constraint account_vault_backups_prf_salt_length
    check (length(prf_salt) between 32 and 256),
  constraint account_vault_backups_envelope_size
    check (pg_column_size(encrypted_envelope) <= 7864320),
  constraint account_vault_backups_envelope_shape
    check (
      jsonb_typeof(encrypted_envelope) = 'object'
      and encrypted_envelope ? 'format'
      and encrypted_envelope ? 'version'
      and encrypted_envelope ? 'ciphertext'
      and encrypted_envelope ? 'accountKeyWrap'
    )
);

alter table public.account_vault_backups enable row level security;

revoke all on table public.account_vault_backups from anon, authenticated;
grant select, insert, update, delete on table public.account_vault_backups to authenticated;

drop policy if exists "account_vault_backups_select_own" on public.account_vault_backups;
create policy "account_vault_backups_select_own"
on public.account_vault_backups
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
);

drop policy if exists "account_vault_backups_insert_own" on public.account_vault_backups;
create policy "account_vault_backups_insert_own"
on public.account_vault_backups
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
);

drop policy if exists "account_vault_backups_update_own" on public.account_vault_backups;
create policy "account_vault_backups_update_own"
on public.account_vault_backups
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
)
with check (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
);

drop policy if exists "account_vault_backups_delete_own" on public.account_vault_backups;
create policy "account_vault_backups_delete_own"
on public.account_vault_backups
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
);

comment on table public.account_vault_backups is
  'End-to-end encrypted local-vault backup. Only authenticated account owners can access their own ciphertext; this table must never contain plaintext student records or passphrases.';
