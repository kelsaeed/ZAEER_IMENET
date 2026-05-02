# Zaeer Imenet — Online Setup (Free Tier)

This guide takes you from "code on your machine" to "playing online with email
sign-up + Google sign-in". Total cost: **$0**.

## Stack

- **Hosting**: [Vercel](https://vercel.com) (free hobby tier).
- **Backend**: [Supabase](https://supabase.com) (free tier — Postgres + Auth +
  Realtime + Email).
- **Domain**: `your-app.vercel.app` (free).

## 1) Create your Supabase project (5 minutes)

1. Go to <https://app.supabase.com>, sign in (free).
2. **New Project** → pick a name (e.g. `zaeer-imenet`), set a strong DB
   password (Supabase generates one — copy it to your password manager),
   pick the region closest to you. Free tier is fine.
3. Wait ~2 minutes for the project to provision.
4. From the project dashboard, open **Project Settings → API** and copy:
   - `Project URL`            → goes to `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key        → goes to `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret    → goes to `SUPABASE_SERVICE_ROLE_KEY`
     ⚠ **Never** put this in any `NEXT_PUBLIC_*` var or commit it.

## 2) Run the schema

1. In Supabase: **SQL Editor → New query**.
2. Open `supabase/migrations/0001_init.sql` from this repo, copy everything,
   paste into the editor, click **Run**.
3. You should see "Success. No rows returned." This created the
   `profiles` / `games` / `moves` tables, RLS policies, and triggers.

### 2.5) Run the social migration

After the initial schema:

1. **SQL Editor → New query**.
2. Open `supabase/migrations/0002_friends_avatars_rematch.sql`, paste, **Run**.
3. This adds the `friendships` table, rematch fields on `games`, and the
   `avatars` storage bucket with the right RLS policies.

If you've already created users from the older schema, this migration is
idempotent — it'll just no-op the parts that already exist.

### 2.6) Run the chat migration

1. **SQL Editor → New query**.
2. Open `supabase/migrations/0003_chat.sql`, paste, **Run**.
3. This adds `match_messages` (in-game chat tied to a game) and
   `dm_messages` (friend-to-friend DMs, restricted by RLS to accepted
   friendships). Both are added to the Realtime publication.

## 3) Enable Google sign-in (free)

1. <https://console.cloud.google.com> → create a project.
2. **APIs & Services → OAuth consent screen** → "External" → fill in app name,
   support email, save. (You only need scopes: `email`, `profile`, `openid`.)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   "Web application". Add the **Authorized redirect URI** that Supabase shows
   you in **Authentication → Providers → Google** (it looks like
   `https://<your-supabase-project>.supabase.co/auth/v1/callback`).
4. Copy the Client ID + Client Secret into Supabase **Authentication →
   Providers → Google**, toggle **Enable**, save.

That's it — Google sign-in works.

## 4) Tell Supabase your site URL

Supabase needs to know which URLs are allowed to redirect back to.

1. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (during dev). Change to your Vercel
     URL once deployed.
   - Redirect URLs (add both): `http://localhost:3000/auth/callback`,
     `https://your-app.vercel.app/auth/callback`.

## 5) Local environment

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Fill the three Supabase values plus `NEXT_PUBLIC_SITE_URL`.
3. Install the new deps:
   ```bash
   npm install
   ```

## 6) Seed the admin (you)

The seeder reads credentials from `.env.local` and uses Supabase Admin API to
create your user. The password is hashed by Supabase (bcrypt) and **never**
stored on disk in plaintext.

1. Add the four `SEED_ADMIN_*` variables to `.env.local`:
   ```
   SEED_ADMIN_EMAIL=youremail@example.com
   SEED_ADMIN_PASSWORD=<a strong password>
   SEED_ADMIN_USERNAME=k_elsaeed
   SEED_ADMIN_NAME=Khaled — The Zaeer Creator
   ```
2. Run:
   ```bash
   npm run seed:admin
   ```
3. **Delete the four `SEED_ADMIN_*` lines from `.env.local` afterwards.**
4. Sign in once at `http://localhost:3000/login`.
5. Open the profile page and change the password to something only you know.

## 7) Run

```bash
npm run dev
```

Open <http://localhost:3000>. The top-right corner shows the auth badge:
"Sign in" if logged out, your initial avatar if logged in.

## 8) Deploy to Vercel (free)

1. Push the repo to GitHub.
2. <https://vercel.com> → **New Project** → import your repo.
3. In Vercel project settings → **Environment Variables**, add the same
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, and update `NEXT_PUBLIC_SITE_URL` to the
   Vercel URL Vercel gives you (e.g. `https://zaeer-imenet.vercel.app`).
4. Deploy. Update Supabase **Authentication → URL Configuration** with the
   production URL too.

---

## Security model

- **Passwords**: hashed by Supabase (bcrypt) before storage. We never see the
  plaintext after the auth call returns.
- **Email verification**: Supabase sends the verification email automatically
  on sign-up (see **Authentication → Email Templates** to customise).
- **Row-Level Security**: every table is locked. Users can only read/update
  rows they own. Public reads are explicit and minimal.
- **Service role key**: stays server-side. Used only by the seeder script.
  If it leaks, rotate it in **Project Settings → API → Reset**.
- **Rate limiting**: Supabase Auth has built-in rate limits. For Realtime
  channels, configure quotas in the dashboard if you start hitting limits.

## What's next

Phase 2 builds on this foundation:
- Online lobby (create/join games, invite codes)
- Realtime sync of moves so the opponent sees your move instantly
- Server-side move validation (anti-cheat)
- Matchmaking + ratings + replays

The **local two-player mode** (current default) keeps working throughout, so
you can develop & test without Supabase being up.
