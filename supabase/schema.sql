-- ============================================================
-- My Chat 24 — Supabase schema (run in SQL Editor, one shot)
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null default ('user_' || substr(gen_random_uuid()::text, 1, 8)),
  display_name text not null default 'New User',
  email text,
  avatar_url text,
  bio text,
  phone text,
  gender text check (gender in ('male','female','other')),
  role text not null default 'user' check (role in ('user','admin')),
  status text not null default 'active' check (status in ('active','banned')),
  badge text not null default 'none' check (badge in ('none','verified','pro','vip','premium','moderator')),
  last_seen timestamptz default now(),
  created_at timestamptz not null default now()
);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  admin_email text := nullif(current_setting('app.admin_email', true), '');
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'New User'),
    case when new.email is not null and lower(new.email) = lower(admin_email) then 'admin' else 'user' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- touch last_seen
create or replace function public.touch_last_seen()
returns trigger language plpgsql as $$
begin
  update public.profiles set last_seen = now() where id = new.id;
  return new;
end; $$;

-- ---------- conversations ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'dm' check (kind in ('dm','group','channel')),
  name text,
  avatar_url text,
  description text,
  call_policy text not null default 'all' check (call_policy in ('all','admins')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table if not exists public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ---------- messages ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  media_url text,
  media_type text check (media_type in ('image','video','audio')),
  deleted_before_seen boolean not null default false,
  deleted_after_seen boolean not null default false,
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  seen_by uuid[] not null default '{}'
);
create index if not exists messages_conv_created on public.messages (conversation_id, created_at desc);

-- keep conversations.last_message_at fresh
create or replace function public.bump_last_message()
returns trigger language plpgsql security definer as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end; $$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.bump_last_message();

-- ---------- stories ----------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_url text,
  caption text,
  media_type text not null default 'text' check (media_type in ('image','video','text')),
  background text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists stories_expires on public.stories (expires_at);

create table if not exists public.story_views (
  story_id uuid references public.stories(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

-- ---------- calls ----------
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  call_type text not null default 'audio' check (call_type in ('audio','video')),
  status text not null default 'ringing' check (status in ('ringing','accepted','declined','ended','missed','cancelled')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

-- ---------- contacts ----------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, contact_id)
);

-- ---------- WebRTC signaling (short-lived rows) ----------
create table if not exists public.signal_messages (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists signal_receiver on public.signal_messages (receiver_id, created_at);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.calls enable row level security;
alter table public.contacts enable row level security;
alter table public.signal_messages enable row level security;

-- helper: is current user admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- helper: is current user member of conversation?
create or replace function public.is_member(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv and user_id = auth.uid()
  );
$$;

-- profiles: everyone signed in can read; user edits own; admin edits all
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert with check (auth.uid() = id or public.is_admin());

-- conversations
drop policy if exists "conv read member" on public.conversations;
create policy "conv read member" on public.conversations
  for select using (public.is_member(id) or public.is_admin());

drop policy if exists "conv insert" on public.conversations;
create policy "conv insert" on public.conversations
  for insert with check (auth.uid() = created_by);

drop policy if exists "conv update owner" on public.conversations;
create policy "conv update owner" on public.conversations
  for update using (
    auth.uid() = created_by
    or exists (select 1 from public.conversation_members m
               where m.conversation_id = id and m.user_id = auth.uid() and m.role in ('owner','admin'))
    or public.is_admin()
  );

-- members
drop policy if exists "members read" on public.conversation_members;
create policy "members read" on public.conversation_members
  for select using (public.is_member(conversation_id) or public.is_admin());

drop policy if exists "members insert" on public.conversation_members;
create policy "members insert" on public.conversation_members
  for insert with check (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and c.created_by = auth.uid())
    or public.is_admin()
  );

-- messages
drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages
  for select using (public.is_member(conversation_id) or public.is_admin());

drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages
  for insert with check (
    auth.uid() = sender_id and public.is_member(conversation_id)
  );

drop policy if exists "messages update own" on public.messages;
create policy "messages update own" on public.messages
  for update using (auth.uid() = sender_id or public.is_admin());

-- stories: visible to all authenticated
drop policy if exists "stories read" on public.stories;
create policy "stories read" on public.stories
  for select using (auth.role() = 'authenticated');

drop policy if exists "stories insert" on public.stories;
create policy "stories insert" on public.stories
  for insert with check (auth.uid() = user_id);

drop policy if exists "stories delete own" on public.stories;
create policy "stories delete own" on public.stories
  for delete using (auth.uid() = user_id or public.is_admin());

-- story views
drop policy if exists "story views all" on public.story_views;
create policy "story views all" on public.story_views
  for select using (auth.role() = 'authenticated');

drop policy if exists "story views insert" on public.story_views;
create policy "story views insert" on public.story_views
  for insert with check (auth.uid() = viewer_id);

-- calls: participants + admins
drop policy if exists "calls read" on public.calls;
create policy "calls read" on public.calls
  for select using (auth.uid() in (caller_id, callee_id) or public.is_admin());

drop policy if exists "calls insert" on public.calls;
create policy "calls insert" on public.calls
  for insert with check (auth.uid() = caller_id);

drop policy if exists "calls update" on public.calls;
create policy "calls update" on public.calls
  for update using (auth.uid() in (caller_id, callee_id) or public.is_admin());

-- contacts
drop policy if exists "contacts read own" on public.contacts;
create policy "contacts read own" on public.contacts
  for select using (auth.uid() = owner_id or auth.uid() = contact_id or public.is_admin());

drop policy if exists "contacts write own" on public.contacts;
create policy "contacts write own" on public.contacts
  for insert with check (auth.uid() = owner_id);

drop policy if exists "contacts delete own" on public.contacts;
create policy "contacts delete own" on public.contacts
  for delete using (auth.uid() = owner_id);

-- signaling: only sender inserts, only receiver reads
drop policy if exists "signal insert" on public.signal_messages;
create policy "signal insert" on public.signal_messages
  for insert with check (auth.uid() = sender_id);

drop policy if exists "signal read" on public.signal_messages;
create policy "signal read" on public.signal_messages
  for select using (auth.uid() = receiver_id or auth.uid() = sender_id);

-- Realtime publication
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'signal_messages') then
    alter publication supabase_realtime add table public.signal_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'calls') then
    alter publication supabase_realtime add table public.calls;
  end if;
end $$;

-- ============================================================
-- Storage bucket 'media' (public read, owner write)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects
  for select using (bucket_id = 'media');

drop policy if exists "media upload" on storage.objects;
create policy "media upload" on storage.objects
  for insert with check (bucket_id = 'media' and auth.role() = 'authenticated');

drop policy if exists "media own delete" on storage.objects;
create policy "media own delete" on storage.objects
  for delete using (bucket_id = 'media' and owner = auth.uid());

-- ============================================================
-- PROMOTE ADMIN (idempotent): sets admin@aminul.com as admin
-- ============================================================
update public.profiles
set role = 'admin', badge = 'vip'
where lower(email) = 'admin@aminul.com';

-- fallback: if the admin user hasn't signed up yet, create the auth user
-- (password: 11223345 — change after first login)
do $$
declare
  uid uuid;
begin
  if exists (select 1 from auth.users where lower(email) = 'admin@aminul.com') then
    select id into uid from auth.users where lower(email) = 'admin@aminul.com' limit 1;
    update public.profiles set role = 'admin', badge = 'vip' where id = uid;
  end if;
end $$;
