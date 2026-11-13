# Supabase Setup Guide — Loyalty Engine Auth

## Step 1: Create Supabase Project

1. Go to https://supabase.com → Sign in with GitHub
2. Click "New Project"
3. Configure:
   - **Organization**: Your org (or create new)
   - **Name**: `loyalty-engine-auth`
   - **Database Password**: Generate strong password → save to 1Password vault "digid pay" as `Supabase - Loyalty Engine (DB Password)`
   - **Region**: `eu-west-1` (Ireland — closest to Switzerland, ~15ms)
4. Click "Create new project"
5. Wait ~2 minutes for provisioning

## Step 2: Get API Keys

1. Go to Project → Settings → API
2. Copy these values:
   - **Project URL**: `https://xxx.supabase.co`
   - **anon public**: `eyJ...` (safe for client-side)
   - **service_role**: `eyJ...` (server-side only, NEVER expose)
3. Save to 1Password vault "digid pay" as:
   - `Supabase - Loyalty Engine` (item)
   - Fields: `project_url`, `anon_key`, `service_role_key`

## Step 3: Configure Auth Providers

### 3a. Email Magic Link (Default)
- Already enabled by default
- Test: Go to Authentication → Sign In → Email → Enter test email → Check inbox for magic link

### 3b. Google OAuth (for Gmail access)

1. Go to https://console.cloud.google.com
2. Create new project: `loyalty-engine-gmail`
3. Enable APIs:
   - Search "Gmail API" → Enable
   - Search "Google People API" → Enable (optional, for contacts)
4. Create OAuth credentials:
   - APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: **Web application**
   - Name: `Loyalty Engine Gmail`
   - **Authorized redirect URIs**:
     ```
     https://xxx.supabase.co/auth/v1/callback
     https://loyalty.digid.cc/auth/gmail/callback
     http://localhost:3000/auth/gmail/callback
     ```
   - Click Create
   - Copy **Client ID** and **Client Secret**

5. Configure OAuth consent screen:
   - APIs & Services → OAuth consent screen
   - User type: **External**
   - App information:
     - App name: `Loyalty Engine`
     - User support email: `kris@digid.co`
     - Developer contact: `kris@digid.co`
   - Scopes: Click "Add or remove scopes"
     - ✅ `https://www.googleapis.com/auth/gmail.readonly` (RESTRICTED)
     - ✅ `https://www.googleapis.com/auth/userinfo.email` (sensitive)
     - Click "Update"
   - Test users: Click "Add users"
     - Add your Gmail: `kriswork@pm.me`
     - Add any other test users (max 100 without verification)
   - Save

6. Back in Supabase:
   - Authentication → Providers → Google
   - Enable: ON
   - Client ID: (paste from step 4)
   - Client Secret: (paste from step 4)
   - Save

## Step 4: Configure Site URLs

1. Supabase → Authentication → URL Configuration
2. Set:
   - **Site URL**: `https://loyalty.digid.cc`
   - **Redirect URLs**: Click "Add URL"
     - `https://loyalty.digid.cc/auth/callback`
     - `https://loyalty.digid.cc/auth/gmail/callback`
     - `http://localhost:3000/auth/callback` (for dev)
3. Save

## Step 5: Create User Profiles Table (Supabase Postgres)

1. Supabase → SQL Editor → New query
2. Paste:
```sql
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  gmail_connected BOOLEAN DEFAULT FALSE,
  gmail_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```
3. Click "Run"

## Step 6: Set Environment Variables in Cloudflare Pages

1. Cloudflare Dashboard → Workers & Pages → loyalty-digid → Settings → Environment variables
2. Add (Production):
   ```
   SUPABASE_URL = https://xxx.supabase.co
   SUPABASE_ANON_KEY = eyJ...
   SUPABASE_SERVICE_ROLE_KEY = eyJ...  (mark as "Secret")
   GOOGLE_CLIENT_ID = xxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET = GOCSPX-...  (mark as "Secret")
   ENCRYPTION_KEY = <32-byte hex>  (generate: openssl rand -hex 32)
   ```
3. Save

## Step 7: Test Auth Flow

1. Deploy updated `_worker.js` with JWT verification
2. Visit `https://loyalty.digid.cc/auth/login`
3. Enter email → Check inbox → Click magic link
4. Should redirect to `/dashboard`
5. Verify JWT in browser DevTools → Application → Cookies

## Verification Checklist

- [ ] Supabase project created
- [ ] API keys saved to 1Password
- [ ] Google OAuth client created
- [ ] Google OAuth consent screen configured (test users added)
- [ ] Supabase Google provider enabled
- [ ] Site URLs configured
- [ ] user_profiles table created with RLS
- [ ] Environment variables set in Cloudflare Pages
- [ ] Magic link login works
- [ ] Google OAuth login works (test user)
