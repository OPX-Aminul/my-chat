# My Chat 24 💬

**My Chat 24** is a realtime chat app with **24-hour stories** and **audio/video calls** — built with React + WebRTC, backed by **Supabase** (Postgres, Auth, Realtime, Storage) and relayed through **Cloudflare TURN** when peer-to-peer fails.

## ✨ Features

- 🔐 **Auth** — Gmail/email sign-in with OTP (if enabled in Supabase) or email + password
- 👤 **Profiles** — avatar upload, display name, auto-generated @username, phone, gender, bio
- 💬 **Realtime chat** — 1:1 DMs, **groups** (everyone can call) and **channels** (only admins can call)
- 📸 **Media** — photos, videos and voice notes in chat; edit within 15 minutes; delete before/after seen; seen ✓✓ receipts
- 📡 **Stories** — photo/video/text stories visible 24 hours to your contacts, with view tracking
- 📞 **Calls** — WebRTC audio/video with STUN (Google) + **Cloudflare TURN** short-lived credentials (edge function)
- 🛡 **Admin panel** — three-dot menu → Admin panel (admin email only):
  view all users, monitor all chats, set 5 badge types (Verified, Pro, VIP, Premium, Moderator), ban/unban, promote/demote admins
- 👑 **Admin everywhere** — admin chats/calls like a normal user; everyone sees a golden crown next to their name
- 🔔 **Background notifications** — messages & incoming calls raise local notifications on Android even when the app is in recents
- 📱 **Android APK** — Capacitor-based, auto-built and released on every push via GitHub Actions

## 🚀 Quick start

```bash
bun install
bun run dev
```

The Supabase URL and anon key are baked in. Create the database schema once:

1. Open your Supabase project → **SQL Editor**
2. Paste the full contents of [`supabase/schema.sql`](supabase/schema.sql) and run it — this
   also auto-creates the admin account and the TURN RPC in one shot
3. Reload the app — the "Database setup needed" notice disappears

### Admin account

The email `admin@aminul.com` gets the admin panel automatically (sign up with any password,
then run the last block of `schema.sql` again after first signup if needed — it promotes the
profile to admin + VIP badge). Default admin password set at signup: change it after first login.

### Contacts sync

"Contacts" are any My Chat 24 users you add by @username or phone — their profiles appear in
your contact list automatically (avatar, name, badge, online status).

## 📞 TURN / STUN configuration (SQL Editor only — no CLI)

Everything lives in `supabase/schema.sql`. When you run it in the Supabase SQL Editor it also:

1. Stores the TURN Token ID in a **private** table (`private.turn_config`) clients can't read
2. Creates a `generate_ice_servers()` RPC that calls Cloudflare server-side and returns
   short-lived credentials (with a 23h cache to save cost)
3. Falls back to public STUN automatically if the API token isn't set yet

**One manual step:** open the SQL Editor and run (replace `CHANGE_ME` with your Cloudflare API token):

```sql
update private.turn_config set secret = 'CHANGE_ME' where id = 1;
```

Or, even better, store it in Vault: Dashboard → Vault → Secrets → name `TURN_API_TOKEN` — the RPC picks it up automatically. The Cloudflare API token never reaches the browser either way.

### Admin account

`admin@aminul.com` / `1234` is created automatically by `schema.sql` (email confirmed, full profile:
username `admin`, display name "Aminul (Admin)", VIP crown 👑). The admin chats, calls and edits
their own profile exactly like a normal user — everyone just sees the golden crown next to their name.
Change the password after first login (Supabase Dashboard → Authentication → Users).

## 📱 Android APK & auto-releases

Every push to `main` triggers [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Builds the web bundle (`vite build`)
2. Adds/syncs the Capacitor Android platform
3. Builds `app-debug.apk` with Gradle
4. Creates a GitHub Release with the APK attached, tag auto-increments `v1.0.0 → v1.0.1 → …`

Download the latest APK from the repo's **Releases** page and install it
(enable "Install from unknown sources").

Local Android development:

```bash
bun run build
bunx cap add android   # first time only
bunx cap sync android
bunx cap open android  # opens Android Studio
```

## 🗂 Project structure

```
src/
  components/     # ui primitives, call overlay
  lib/            # supabase client, api layer, call engine, types
  pages/          # Landing, Auth, ProfileSetup, ChatApp, AdminPanel
supabase/
  schema.sql      # full database schema + RLS (run in SQL Editor)
  functions/get-ice-servers/   # TURN credential edge function
.github/workflows/release.yml # APK build + auto release
```

## 🔒 Security notes

- Row Level Security on every table — users only see their own conversations; admins see all
- TURN API token lives only in Supabase edge function secrets
- Service-role key is **never** used client-side
