create table if not exists public.nass_google_drive_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.nass_google_drive_tokens enable row level security;
revoke all on table public.nass_google_drive_tokens from anon, authenticated;
grant all on table public.nass_google_drive_tokens to service_role;
