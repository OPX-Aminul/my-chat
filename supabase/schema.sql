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
-- (the admin email gets role='admin' + VIP crown badge automatically)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  admin_email text := coalesce(nullif(current_setting('app.admin_email', true), ''), 'admin@aminul.com');
  is_admin boolean := new.email is not null and lower(new.email) = lower(admin_email);
begin
  insert into public.profiles (id, email, display_name, role, badge)
  values (
    new.id,
    new.email,
    case when is_admin then 'Aminul (Admin)'
         else coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'New User') end,
    case when is_admin then 'admin' else 'user' end,
    case when is_admin then 'vip' else 'none' end
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
-- TURN credentials — pure SQL setup (no CLI, no edge function)
-- ============================================================
-- How it works:
--   1. The Cloudflare TURN Token ID + API Token are stored in a PRIVATE
--      table (private.turn_config) that clients can never read.
--   2. generate_ice_servers() is a security-definer RPC that calls the
--      Cloudflare API server-side and returns short-lived iceServers.
--   3. If the tokens are not filled in yet, it returns public STUN fallback
--      so calls still work (same-NAT / P2P).
--
-- Fill in your real API token below (TURN_TOKEN_ID is already set):
--   >> Replace CHANGE_ME with the Cloudflare API Token <<

do $$ begin create extension if not exists http;  exception when others then null; end $$;
do $$ begin create extension if not exists pg_net; exception when others then null; end $$;

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.turn_config (
  id int primary key default 1 check (id = 1),
  key_id text,
  secret text,
  ice_cache jsonb,
  ice_cached_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into private.turn_config (id, key_id, secret)
values (1, 'd0e047d1b08e5318b0edd6d1ecaea3e2', null)
on conflict (id) do nothing;

-- If the secret is stored in Vault (Dashboard → Vault), it is read from there.
-- Prefer this (better than plain text below): secrets → name = TURN_API_TOKEN
-- Or paste it directly in the update at the bottom of this file.

-- Single HTTP POST helper: tries the `http` extension first, falls back to pg_net.
do $$
declare
  has_http boolean;
  has_net boolean;
begin
  select exists(select 1 from pg_extension where extname = 'http') into has_http;
  select exists(select 1 from pg_extension where extname = 'pg_net') into has_net;

  if has_http then
    execute $fn$
      create or replace function public._cf_request(p_url text, p_token text, p_body jsonb)
      returns jsonb language plpgsql volatile as $body$
      declare r record;
      begin
        select * into r from http(
          ('POST', p_url, jsonb_build_object('Authorization','Bearer '||p_token), 'application/json', p_body::text)::http_request
        );
        if r.status between 200 and 299 then
          return r.content::jsonb;
        end if;
        return null;
      exception when others then return null;
      end $body$;
    $fn$;
  elsif has_net then
    execute $fn$
      create or replace function public._cf_request(p_url text, p_token text, p_body jsonb)
      returns jsonb language plpgsql volatile as $body$
      declare req bigint; rec record; tries int := 0;
      begin
        select net.http_post(
          url := p_url,
          headers := jsonb_build_object('Authorization','Bearer '||p_token,'Content-Type','application/json'),
          body := p_body
        ) into req;
        while tries < 50 loop
          perform pg_sleep(0.1);
          select * into rec from net._http_response where id = req;
          exit when found and rec.status_code is not null;
          tries := tries + 1;
        end loop;
        if rec.status_code between 200 and 299 then
          return rec.content::jsonb;
        end if;
        return null;
      exception when others then return null;
      end $body$;
    $fn$;
  else
    execute $fn$
      create or replace function public._cf_request(p_url text, p_token text, p_body jsonb)
      returns jsonb language plpgsql volatile as $body$
      begin return null; end $body$;
    $fn$;
  end if;
end $$;

-- Main RPC used by the app (src/lib/turn.ts → supabase.rpc('generate_ice_servers'))
create or replace function public.generate_ice_servers(p_ttl int default 86400)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, net, vault
as $$
declare
  v_uid uuid := auth.uid();
  v_key_id text;
  v_api text;
  v_resp jsonb;
  v_servers jsonb;
  v_cfg record;
  v_fallback jsonb := jsonb_build_object('iceServers', jsonb_build_array(
    jsonb_build_object('urls', jsonb_build_array('stun:stun.l.google.com:19302')),
    jsonb_build_object('urls', jsonb_build_array('stun:stun1.l.google.com:19302')),
    jsonb_build_object('urls', jsonb_build_array('stun:stun2.l.google.com:19302')),
    jsonb_build_object('urls', jsonb_build_array('stun:stun.services.mozilla.com:3478')),
    jsonb_build_object('urls', jsonb_build_array('stun:stun.l.google.com:5349'))
  ));
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_ttl is null or p_ttl < 60 or p_ttl > 86400 then
    p_ttl := 86400;
  end if;

  select * into v_cfg from private.turn_config where id = 1;
  v_key_id := v_cfg.key_id;
  v_api := coalesce(v_cfg.secret, '');

  -- If no plain secret stored, try Vault (name = TURN_API_TOKEN)
  if v_api = '' and v_key_id is not null then
    begin
      select decrypted_secret into v_api
      from vault.decrypted_secrets
      where name = 'TURN_API_TOKEN'
      limit 1;
    exception when others then v_api := '';
    end;
  end if;

  -- Tokens not configured yet → STUN-only fallback (P2P still works)
  if coalesce(v_key_id, '') = '' or coalesce(v_api, '') = '' then
    return v_fallback;
  end if;

  -- Serve a fresh cache for 23h (Cloudflare ttl max is 24h) — saves cost & latency
  if v_cfg.ice_cached_at is not null
     and v_cfg.ice_cache is not null
     and v_cfg.ice_cached_at > now() - interval '23 hours' then
    return v_cfg.ice_cache;
  end if;

  v_resp := public._cf_request(
    'https://rtc.live.cloudflare.com/v1/turn/keys/' || v_key_id || '/credentials/generate-ice-servers',
    v_api,
    jsonb_build_object('ttl', p_ttl)
  );

  if v_resp is not null and v_resp ? 'iceServers' then
    v_servers := v_resp;
    update private.turn_config
    set ice_cache = v_servers, ice_cached_at = now(), updated_at = now()
    where id = 1;
    return v_servers;
  end if;

  -- Cloudflare unreachable / auth failed → fallback (do not cache)
  return v_fallback;
end;
$$;

revoke execute on function public.generate_ice_servers(int) from anon;
grant execute on function public.generate_ice_servers(int) to authenticated;

-- ============================================================
-- ADMIN AUTO-CREATION (idempotent — runs at the end of this script)
-- ============================================================
-- Creates admin@aminul.com / 1234 if it does not exist yet, confirms the
-- email, and gives the profile: username 'admin', VIP crown badge, full
-- admin powers. The admin can chat & call exactly like a normal user and
-- edit their own profile — everyone just sees the 👑 crown on their name.
create or replace function public.ensure_admin_user()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := 'admin@aminul.com';
  v_pass text := '1234';
  v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = v_email limit 1;

  if v_uid is null then
    insert into auth.users (
      instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, crypt(v_pass, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      '{"display_name":"Aminul (Admin)"}',
      now(), now(), '', '', '', ''
    )
    returning id into v_uid;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid, 'email',
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      now(), now(), now()
    )
    on conflict do nothing;
  end if;

  -- Full profile with every detail pre-filled
  begin
    insert into public.profiles (id, username, display_name, email, role, status, badge, bio, avatar_url, phone, gender)
    values (
      v_uid, 'admin', 'Aminul (Admin)', v_email, 'admin', 'active', 'vip',
      'My Chat 24 administrator 👑', null, null, null
    );
  exception when unique_violation then
    null; -- username 'admin' taken or profile exists — fall through to update
  end;

  update public.profiles
  set role = 'admin', status = 'active', email = v_email,
      badge = case when badge = 'none' then 'vip' else badge end,
      username = case when username like 'user\_%' then 'admin' else username end
  where id = v_uid;

  return v_uid;
end;
$$;

select public.ensure_admin_user();
