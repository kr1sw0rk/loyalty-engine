# Loyalty Engine User Platform — Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Static UI   │  │   Auth UI   │  │  Recommendation UI   │ │
│  │  Dashboard   │  │  Login/     │  │  Model Output        │ │
│  │  Membership  │  │  Signup     │  │  Display             │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  _worker.js (Advanced Mode)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Supabase    │  │ Gmail API   │  │ Recommender ML      │ │
│  │ Auth JWT    │  │ OAuth +     │  │ Model Inference     │ │
│  │ Verification│  │ Email Parse │  │ (ONNX/TF.js)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare D1                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   users      │  │  user_      │  │  recommendations    │ │
│  │  (Supabase   │  │  memberships│  │  (model output      │ │
│  │   synced)    │  │  + spend    │  │   cache)            │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  providers   │  │ parameters  │  │  crawled_data       │ │
│  │  (existing)  │  │ (existing)  │  │  (existing)         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Phase 1: Supabase Auth Setup (Week 1)

### 1.1 Create Supabase Project
1. Go to https://supabase.com → New Project
2. Name: `loyalty-engine-auth`
3. Region: `eu-west-1` (closest to Switzerland)
4. Save database password to 1Password vault "digid pay"
5. Note: Project URL + anon key + service role key

### 1.2 Configure Auth Providers
1. **Email Magic Link** (default, enabled)
2. **Google OAuth** (for Gmail access — same provider)
   - Go to Google Cloud Console → APIs & Services → Credentials
   - Create OAuth 2.0 Client ID (Web application)
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Copy Client ID + Secret to Supabase → Authentication → Providers → Google
3. **Passkeys** (optional, later)

### 1.3 Configure Site URL
- Supabase → Authentication → URL Configuration
- Site URL: `https://loyalty.digid.cc`
- Redirect URLs: `https://loyalty.digid.cc/auth/callback`

### 1.4 Create Supabase Tables (for auth metadata)
```sql
-- Sync Supabase auth.users → D1.users via webhook
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  gmail_connected BOOLEAN DEFAULT FALSE,
  gmail_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: users can only read their own profile
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);
```

### 1.5 Cloudflare Worker: JWT Verification
```javascript
// _worker.js — add to existing file
import { createRemoteJWKSet, jwtVerify } from 'jose';

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

// Cache JWKS
let jwksCache = null;

async function verifySupabaseJWT(token) {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(
      new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
    );
  }
  const { payload } = await jwtVerify(token, jwksCache, {
    issuer: `${SUPABASE_URL}/auth/v1`,
  });
  return payload; // { sub: user_id, email, ... }
}

async function requireUser(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { error: 'Missing authorization', status: 401 };
  }
  const token = auth.slice(7);
  try {
    const user = await verifySupabaseJWT(token);
    // Sync to D1 if not exists
    await syncUserToD1(user, env);
    return { user };
  } catch (err) {
    return { error: 'Invalid token', status: 401 };
  }
}

async function syncUserToD1(user, env) {
  const existing = await env.loyalty_engine
    .prepare('SELECT id FROM users WHERE id = ?')
    .bind(user.sub)
    .first();
  if (!existing) {
    await env.loyalty_engine
      .prepare(`INSERT INTO users (id, email, created_at) VALUES (?, ?, datetime('now'))`)
      .bind(user.sub, user.email)
      .run();
  }
}
```

### 1.6 New D1 Tables
```sql
-- users (synced from Supabase)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Supabase auth.users.id (UUID)
  email TEXT UNIQUE NOT NULL,
  gmail_connected INTEGER DEFAULT 0,
  gmail_token_expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- user_memberships (what programs user is in)
CREATE TABLE IF NOT EXISTS user_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES providers(id),
  tier_name TEXT, -- e.g., "Gold", "Platinum"
  points_balance INTEGER,
  joined_date TEXT,
  last_active_date TEXT,
  notes TEXT,
  source TEXT DEFAULT 'manual', -- 'manual', 'gmail', 'plaid'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, provider_id)
);

-- user_spend (optional, from Plaid or manual entry)
CREATE TABLE IF NOT EXISTS user_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sector TEXT NOT NULL, -- 'airline', 'hotel', etc.
  annual_amount REAL, -- in USD
  frequency TEXT, -- 'weekly', 'monthly', 'quarterly'
  avg_transaction REAL,
  period_start TEXT,
  period_end TEXT,
  source TEXT DEFAULT 'manual', -- 'manual', 'plaid'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, sector, period_start)
);

-- recommendations (cached model output)
CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_provider_id INTEGER REFERENCES providers(id),
  to_provider_id INTEGER REFERENCES providers(id),
  sector TEXT NOT NULL,
  delta_value REAL, -- estimated annual benefit in USD
  confidence REAL, -- 0.0 to 1.0
  reasoning TEXT, -- JSON: {current_earn, alt_earn, redemption_value, ...}
  generated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  status TEXT DEFAULT 'active' -- 'active', 'dismissed', 'accepted'
);

-- gmail_scans (audit log of email scans)
CREATE TABLE IF NOT EXISTS gmail_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_date TEXT DEFAULT (datetime('now')),
  emails_scanned INTEGER,
  programs_detected INTEGER,
  new_memberships INTEGER,
  status TEXT, -- 'success', 'partial', 'failed'
  error_message TEXT
);
```

## Phase 2: Gmail OAuth Integration (Week 2-3)

### 2.1 Google Cloud Console Setup
1. Go to https://console.cloud.google.com
2. Create new project: `loyalty-engine-gmail`
3. Enable APIs:
   - Gmail API
   - Google People API (for contacts, optional)
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Name: `Loyalty Engine Gmail`
   - Authorized redirect URIs:
     - `https://loyalty.digid.cc/auth/gmail/callback`
     - `http://localhost:3000/auth/gmail/callback` (for dev)
5. Configure OAuth consent screen:
   - User type: External
   - App name: `Loyalty Engine`
   - Support email: `kris@digid.co`
   - Developer contact: `kris@digid.co`
   - Scopes:
     - `https://www.googleapis.com/auth/gmail.readonly` (RESTRICTED)
     - `https://www.googleapis.com/auth/userinfo.email` (sensitive)
   - Test users: add your Gmail for testing
   - **Note**: `gmail.readonly` requires restricted scope verification (6 weeks)

### 2.2 Alternative: Use `gmail.metadata` Scope (Simpler)
- `gmail.metadata` = read headers/labels only (no bodies)
- Can search with `q=` parameter
- But: can't read email bodies to extract membership details
- **Verdict**: Not sufficient for our use case

### 2.3 Gmail Email Patterns to Detect
```javascript
const LOYALTY_PATTERNS = [
  // Welcome / enrollment
  { pattern: /welcome to (\w+) (rewards|loyalty|points|miles)/i, type: 'enrollment' },
  { pattern: /your (\w+) membership number/i, type: 'enrollment' },
  { pattern: /membership id[:\s]+([A-Z0-9-]+)/i, type: 'membership_id' },

  // Points / miles statements
  { pattern: /your (\w+) balance/i, type: 'balance' },
  { pattern: /(\d[\d,]*) (points|miles|stars) available/i, type: 'balance' },
  { pattern: /points earned[:\s]+(\d[\d,]*)/i, type: 'earnings' },

  // Tier / status
  { pattern: /you'?re now (\w+) (tier|status|member)/i, type: 'tier' },
  { pattern: /status[:\s]+(gold|platinum|diamond|elite|premium)/i, type: 'tier' },

  // Expiration
  { pattern: /your (points|miles) (expire|expiration)/i, type: 'expiration' },
  { pattern: /expire on (\w+ \d+,? \d{4})/i, type: 'expiration_date' },

  // Co-branded cards
  { pattern: /\b(chase|amex|american express|citi|capital one|barclays)\b.*card/i, type: 'card' },
];

const SENDER_PATTERNS = [
  /@marriott\.com$/i,
  /@hilton\.com$/i,
  /@united\.com$/i,
  /@delta\.com$/i,
  /@starbucks\.com$/i,
  /@sephora\.com$/i,
  /@amazon\.com$/i,
  // ... add 168 provider domains
];
```

### 2.4 Gmail OAuth Flow (Worker)
```javascript
// Step 1: Initiate OAuth
async function initiateGmailAuth(request, env) {
  const user = await requireUser(request, env);
  if (user.error) return json({ error: user.error }, 401);

  const state = crypto.randomUUID(); // CSRF protection
  // Store state in D1 with user_id + expiry
  await env.loyalty_engine
    .prepare('INSERT INTO oauth_states (user_id, state, expires_at) VALUES (?, ?, datetime('now', '+10 minutes'))')
    .bind(user.user.sub, state)
    .run();

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', 'https://loyalty.digid.cc/auth/gmail/callback');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  return json({ auth_url: authUrl.toString() });
}

// Step 2: Handle callback
async function handleGmailCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // Verify state
  const stateRecord = await env.loyalty_engine
    .prepare('SELECT user_id FROM oauth_states WHERE state = ? AND expires_at > datetime('now')')
    .bind(state)
    .first();
  if (!stateRecord) return json({ error: 'Invalid state' }, 400);

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: 'https://loyalty.digid.cc/auth/gmail/callback',
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json();

  // Store tokens (encrypted) in D1
  await env.loyalty_engine
    .prepare(`UPDATE users SET gmail_connected = 1, gmail_token = ?, gmail_refresh_token = ?, gmail_token_expires_at = ? WHERE id = ?`)
    .bind(
      await encrypt(tokens.access_token, env.ENCRYPTION_KEY),
      await encrypt(tokens.refresh_token, env.ENCRYPTION_KEY),
      new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      stateRecord.user_id
    )
    .run();

  // Clean up state
  await env.loyalty_engine
    .prepare('DELETE FROM oauth_states WHERE state = ?')
    .bind(state)
    .run();

  return Response.redirect('https://loyalty.digid.cc/dashboard?gmail=connected');
}

// Step 3: Scan emails for loyalty programs
async function scanGmailForLoyalty(userId, env) {
  // Get fresh access token (refresh if expired)
  const accessToken = await getGmailAccessToken(userId, env);

  // Search for loyalty-related emails (last 2 years)
  const queries = [
    'subject:(welcome OR membership OR rewards OR points OR miles) newer_than:2y',
    'from:(@marriott.com OR @hilton.com OR @united.com OR @delta.com OR @starbucks.com OR @sephora.com)',
    'subject:(your balance OR points earned OR tier status) newer_than:1y',
  ];

  const detectedPrograms = new Map();

  for (const q of queries) {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();

    for (const msg of listData.messages || []) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json();

      // Extract from headers
      const from = msgData.payload?.headers?.find(h => h.name === 'From')?.value || '';
      const subject = msgData.payload?.headers?.find(h => h.name === 'Subject')?.value || '';

      // Match against provider domains
      const provider = matchProviderFromEmail(from, subject);
      if (provider && !detectedPrograms.has(provider.id)) {
        detectedPrograms.set(provider.id, {
          provider_id: provider.id,
          source: 'gmail',
          evidence: { from, subject, message_id: msg.id },
        });
      }
    }
  }

  // Save to user_memberships
  let newCount = 0;
  for (const [, detection] of detectedPrograms) {
    const result = await env.loyalty_engine
      .prepare(`INSERT OR IGNORE INTO user_memberships (user_id, provider_id, source) VALUES (?, ?, 'gmail')`)
      .bind(userId, detection.provider_id)
      .run();
    if (result.meta?.changes > 0) newCount++;
  }

  // Log scan
  await env.loyalty_engine
    .prepare(`INSERT INTO gmail_scans (user_id, emails_scanned, programs_detected, new_memberships, status) VALUES (?, ?, ?, ?, 'success')`)
    .bind(userId, listData.messages?.length || 0, detectedPrograms.size, newCount)
    .run();

  return { detected: detectedPrograms.size, new: newCount };
}
```

## Phase 3: Recommender ML Model (Week 4-6)

### 3.1 Model Architecture
- **Type**: Gradient Boosted Decision Tree (XGBoost/LightGBM)
- **Input Features**: 77 program parameters + user spend + user tier
- **Output**: Expected annual value delta if switching
- **Training Data**: Synthetic (program economics) + user feedback loop

### 3.2 Feature Engineering
```python
# Features per (user, current_program, alternative_program) pair
features = {
    # Current program economics
    'current_earn_rate': float, # points per $1
    'current_redemption_value': float,  # cents per point
    'current_tier': int, # 0=base, 1=silver, 2=gold, etc.
    'current_annual_spend': float,     # user's spend in sector

    # Alternative program economics
    'alt_earn_rate': float,
    'alt_redemption_value': float,
    'alt_tier_threshold': float,       # spend to reach equivalent tier
    'alt_membership_fee': float,       # 0 if free

    # Program features
    'sector_match': bool,              # same sector?
    'alliance_compatible': bool,       # can transfer points?
    'transfer_ratio': float,           # points conversion ratio

    # User features
    'user_tenure_months': int,         # how long in current program
    'user_points_balance': int,        # points to potentially lose
    'redemption_goal': str,            # 'travel', 'cashback', 'merchandise'
}
```

### 3.3 Model Training (Offline)
```python
# train_recommender.py
import xgboost as xgb
import pandas as pd
from sklearn.model_selection import train_test_split

# Load program data from D1
programs = pd.read_sql('SELECT * FROM normalized_records_full', d1_conn)

# Generate synthetic user profiles
users = generate_synthetic_users(n=10000)

# Generate training pairs
pairs = []
for user in users:
    for current in user.memberships:
        for alt in programs:
            if alt.sector == current.sector and alt.id != current.id:
                features = compute_features(user, current, alt)
                label = compute_actual_value_delta(user, current, alt)
                pairs.append((features, label))

# Train XGBoost
X_train, X_test, y_train, y_test = train_test_split(features, labels)
model = xgb.XGBRegressor(n_estimators=100, max_depth=6)
model.fit(X_train, y_train)

# Export to ONNX for Cloudflare Workers
import onnxmltools
onnx_model = onnxmltools.convert_xgboost(model)
onnxmltools.save_model(onnx_model, 'recommender.onnx')
```

### 3.4 Model Inference (Worker)
```javascript
// _worker.js — add ONNX inference
import { InferenceSession } from 'onnxruntime-web'; // or onnxruntime-node

let session = null;

async function getRecommendations(userId, env) {
  if (!session) {
    session = await InferenceSession.create(env.RECOMMENDER_MODEL_URL);
  }

  // Load user data
  const user = await env.loyalty_engine
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first();

  const memberships = await env.loyalty_engine
    .prepare(`
      SELECT um.*, p.*, n.*
      FROM user_memberships um
      JOIN providers p ON um.provider_id = p.id
      LEFT JOIN normalized_records_full n ON p.company_name = n.company_name
      WHERE um.user_id = ?
    `)
    .bind(userId)
    .all();

  const spend = await env.loyalty_engine
    .prepare('SELECT * FROM user_spend WHERE user_id = ?')
    .bind(userId)
    .all();

  // Generate recommendations for each membership
  const recommendations = [];
  for (const membership of memberships.results) {
    const alternatives = await env.loyalty_engine
      .prepare(`
        SELECT p.*, n.*
        FROM providers p
        LEFT JOIN normalized_records_full n ON p.company_name = n.company_name
        WHERE p.sector = ? AND p.id != ?
      `)
      .bind(membership.sector, membership.provider_id)
      .all();

    for (const alt of alternatives.results) {
      const features = computeFeatures(user, membership, alt, spend.results);
      const tensor = new Float32Array(Object.values(features));
      const result = await session.run({ input: tensor });
      const deltaValue = result.output.data[0];

      if (deltaValue > 50) { // Only recommend if >$50/year benefit
        recommendations.push({
          from_provider_id: membership.provider_id,
          to_provider_id: alt.id,
          sector: membership.seector,
          delta_value: deltaValue,
          confidence: Math.min(deltaValue / 500, 1.0), // Normalize
          reasoning: {
            current_earn: membership.earn_rate,
            alt_earn: alt.earn_rate,
            redemption_value: alt.best_redemption,
          },
        });
      }
    }
  }

  // Cache in D1
  for (const rec of recommendations) {
    await env.loyalty_engine
      .prepare(`
        INSERT OR REPLACE INTO recommendations
        (user_id, from_provider_id, to_provider_id, sector, delta_value, confidence, reasoning, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 days'))
      `)
      .bind(userId, rec.from_provider_id, rec.to_provider_id, rec.sector, rec.delta_value, rec.confidence, JSON.stringify(rec.reasoning))
      .run();
  }

  return recommendations.sort((a, b) => b.delta_value - a.delta_value);
}
```

### 3.5 Feedback Loop (Improve Model)
```javascript
// User accepts/dismisses recommendation → retrain
async function recordFeedback(request, env) {
  const user = await requireUser(request, env);
  const { recommendation_id, action } = await request.json(); // 'accepted' | 'dismissed'

  await env.loyalty_engine
    .prepare('UPDATE recommendations SET status = ? WHERE id = ? AND user_id = ?')
    .bind(action, recommendation_id, user.user.sub)
    .run();

  // If accepted, record actual switch
  if (action === 'accepted') {
    const rec = await env.loyalty_engine
      .prepare('SELECT * FROM recommendations WHERE id = ?')
      .bind(recommendation_id)
      .first();

    // Update user_memberships
    await env.loyalty_engine
      .prepare('UPDATE user_memberships SET provider_id = ? WHERE user_id = ? AND provider_id = ?')
      .bind(rec.to_provider_id, user.user.sub, rec.from_provider_id)
      .run();

    // Add to training data (offline retrain)
    await env.loyalty_engine
      .prepare('INSERT INTO model_training_log (user_id, recommendation_id, actual_switch, predicted_delta) VALUES (?, ?, 1, ?)')
      .bind(user.user.sub, recommendation_id, rec.delta_value)
      .run();
  }
}
```

## Phase 4: UI Pages (Week 3-5)

### 4.1 Auth Pages
- `/auth/login` — Email magic link + Google OAuth
- `/auth/signup` — Same as login (Supabase handles both)
- `/auth/callback` — Handle Supabase redirect
- `/auth/gmail/callback` — Handle Gmail OAuth

### 4.2 Dashboard Pages
- `/dashboard` — Overview: memberships count, top recommendations
- `/dashboard/memberships` — List/edit current programs
- `/dashboard/memberships/add` — Manual search + select (168 programs)
- `/dashboard/memberships/gmail` — Connect Gmail + scan results
- `/dashboard/spend` — Optional: enter annual spend per sector
- `/dashboard/recommendations` — Ranked list of switches with reasoning

### 4.3 Recommendation Display
```html
<div class="recommendation-card">
  <div class="from-program">
    <img src="/logos/marriott.png" alt="Marriott">
    <span>Marriott Bonvoy (Gold)</span>
  </div>
  <div class="arrow">→</div>
  <div class="to-program">
    <img src="/logos/hilton.png" alt="Hilton">
    <span>Hilton Honors (join)</span>
  </div>
  <div class="value">
    <span class="delta">+$247/year</span>
    <span class="confidence">92% confidence</span>
  </div>
  <div class="reasoning">
    <p>You spend ~$8,000/year on hotels. Hilton's earn rate (10x/$) + redemption value (0.5cpp) 
    outperforms Marriott's (5x/$, 0.7cpp) at your tier.</p>
  </div>
  <div class="actions">
    <button onclick="acceptRecommendation(123)">Switch</button>
    <button onclick="dismissRecommendation(123)">Not interested</button>
  </div>
</div>
```

## Phase 5: Deployment Checklist

### Environment Variables (Cloudflare Pages)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side only
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
ENCRYPTION_KEY=<32-byte hex>  # For encrypting Gmail tokens
RECOMMENDER_MODEL_URL=https://loyalty.digid.cc/models/recommender.onnx
```

### 1Password Items to Create
1. `Supabase - Loyalty Engine` — project URL, anon key, service role key, DB password
2. `Google OAuth - Loyalty Engine Gmail` — client ID, client secret
3. `Loyalty Engine Encryption Key` — 32-byte hex for token encryption

### Google OAuth Verification (Critical Path)
- **Week 1**: Submit brand verification (2-3 days)
- **Week 1**: Submit restricted scope verification for `gmail.readonly`
- **Week 2-7**: Wait for approval (6 weeks typical)
- **Fallback**: Use test mode (100 users max) until approved

## Cost Estimate

| Service | Free Tier | Paid Tier | Our Usage (1000 users) |
|---------|-----------|-----------|------------------------|
| Supabase Auth | 50K MAU | $25/mo (100K) | $0 |
| Cloudflare Pages | 500 builds/mo | $20/mo (unlimited) | $0 |
| Cloudflare D1 | 5M reads/day | $5/mo (10B) | $0 |
| Cloudflare Workers | 100K req/day | $5/mo (10M) | $0 |
| Google Gmail API | Free (quota) | Free | $0 |
| **Total** | | | **$0/mo** |

## Timeline

| Week | Deliverable |
|------|-------------|
| 1 | Supabase project + auth + D1 schema + JWT verification |
| 2 | Gmail OAuth flow + email parser |
| 3 | Manual membership UI + dashboard |
| 4 | Recommender model training + ONNX export |
| 5 | Model inference + recommendation UI |
| 6 | Feedback loop + polish + testing |
| 7 | Google OAuth verification submission |
| 8 | Launch (test mode: 100 users) |
