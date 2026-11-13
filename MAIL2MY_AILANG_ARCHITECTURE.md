# mail2.my Engine + AILANG Parser — Loyalty Detection Architecture

## Overview

The user's proposal: **mail2.my Engine** provisions OXI instances per user + a fork of the **AILANG parser** connected to an LLM that learns to recognize loyalty program status emails.

This is a fundamentally better approach than Gmail OAuth because:
- No Google verification (6 weeks → 0)
- Works with ANY IMAP server (Gmail, Yahoo, Outlook, self-hosted)
- User controls their own credentials (no third-party access)
- LLM learns patterns over time (improves with use)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    mail2.my Engine                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  OXI Fork   │  │  AILANG     │  │  LLM Classifier     │ │
│  │  (per user  │  │  Parser     │  │  (learns loyalty    │ │
│  │   instance) │  │  (fork)     │  │   email patterns)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Loyalty Engine D1                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   users      │  │  user_      │  │  recommendations    │ │
│  │              │  │  memberships│  │  (ML model output)  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. OXI Fork (c0h1b4/oxi)

**Source**: https://github.com/c0h1b4/oxi
**Stack**: React 19 + Next.js 16 + Rust (Axum) + async-imap
**Features**: Webmail, contacts, calendar, full-text search (Tantivy)

**Fork modifications**:
1. **Loyalty Scan Button** — "Scan for loyalty programs" in sidebar
2. **IMAP Search Module** — Rust backend searches for loyalty emails:
   ```rust
   // backend/src/loyalty_scan.rs
   use async_imap::Client;
   
   pub async fn scan_for_loyalty(client: &mut Client<TlsStream<TcpStream>>) -> Result<Vec<DetectedProgram>> {
       // Search by sender domain (168 provider domains)
       let provider_domains = load_provider_domains(); // from D1 or config
       let mut detected = Vec::new();
       
       for domain in provider_domains {
           let search_criteria = format!("FROM \"{}\"", domain);
           let uids = client.uid_search(&search_criteria).await?;
           
           if !uids.is_empty() {
               if let Some(provider) = match_domain_to_provider(&domain) {
                   detected.push(DetectedProgram {
                       provider_id: provider.id,
                       source: "oxi_imap",
                       email_count: uids.len(),
                       evidence_uids: uids,
                   });
               }
           }
       }
       
       Ok(detected)
   }
   ```

3. **AILANG Integration** — Forward emails to AILANG parser for LLM classification
4. **D1 Sync** — Push detected programs to Loyalty Engine D1

**Deployment**: Docker on contabo1 (one container per user, or shared with per-user config)

---

### 2. AILANG Parser Fork

**Source**: https://github.com/sunholo-data/ailang-parse
**Stack**: AILANG language + WebAssembly
**Features**: Deterministic RFC 5322 parsing → structured JSON blocks

**Fork modifications**:
1. **Loyalty Email Classifier** — Add AILANG module for loyalty detection:
   ```
   // ailang/email/loyalty/classify.ailang
   module sunholo/email/loyalty/classify
   
   import sunholo/email/types (Email, EmailBlock)
   import sunholo/json/parser (parseJson)
   
   // Loyalty email patterns
   const LOYALTY_PATTERNS = [
     { pattern: "welcome to .* (rewards|loyalty|points|miles)", type: "enrollment" },
     { pattern: "your .* membership number", type: "membership_id" },
     { pattern: "you're now (gold|platinum|diamond|elite)", type: "tier" },
     { pattern: "points earned.*([0-9,]+)", type: "earnings" },
     { pattern: "your points expire on", type: "expiration" },
   ]
   
   // Sender domain → provider mapping
   const PROVIDER_DOMAINS = {
     "@marriott.com": "Marriott Bonvoy",
     "@hilton.com": "Hilton Honors",
     "@united.com": "United MileagePlus",
     // ... 168 providers
   }
   
   export func classifyLoyaltyEmail(email: Email) -> LoyaltyDetection {
     let from = email.headers.from
     let subject = email.headers.subject
     let body = extractTextBody(email)
     
     // Check sender domain
     let provider = PROVIDER_DOMAINS[from.domain]
     if provider == null {
       return { detected: false }
     }
     
     // Check subject/body patterns
     let detections = []
     for pattern in LOYALTY_PATTERNS {
       if match(pattern.pattern, subject) || match(pattern.pattern, body) {
         detections.push({ type: pattern.type, pattern: pattern.pattern })
       }
     }
     
     return {
       detected: true,
       provider: provider,
       detections: detections,
       confidence: calculateConfidence(detections)
     }
   }
   ```

2. **LLM Training Hook** — Forward uncertain detections to LLM for labeling:
   ```
   export func trainClassifier(email: Email, userLabel: string) -> TrainingExample {
     // Store (email_features, user_label) for periodic retraining
     return {
       features: extractFeatures(email),
       label: userLabel,
       timestamp: now()
     }
   }
   ```

3. **MCP Server** — Expose classification as MCP tool for Loyalty Engine:
   ```
   export mcp_tool classify_loyalty_email(email_path: string) -> LoyaltyDetection {
     let email = parseEmail(email_path)
     return classifyLoyaltyEmail(email)
   }
   ```

---

### 3. LLM Classifier (Learning Layer)

**Purpose**: Learn to recognize loyalty emails from user feedback

**Architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│                   LLM Training Pipeline                      │
│                                                             │
│  User action ──► Training example ──► Periodic retrain      │
│  (label email)   (features, label)   (fine-tune model)      │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Initial    │  │  User       │  │  Fine-tuned         │ │
│  │  rules      │──► feedback   │──► model              │ │
│  │  (168       │  │  loop       │  │  (learns patterns)  │ │
│  │   domains)  │  │             │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Training data flow**:
1. Initial: 168 provider domains + regex patterns (rule-based)
2. User labels: "Yes, this is a loyalty email" / "No, this is spam"
3. Periodic: Fine-tune small model (e.g., DistilBERT) on labeled examples
4. Deploy: Update AILANG classifier with new patterns

**Model options**:
- **TinyLlama/DistilBERT** — Fine-tune on email classification (fast, cheap)
- **GPT-4o-mini** — Few-shot learning (no training, just prompting)
- **Hybrid**: Rules for known domains, LLM for unknown senders

---

## Data Flow

### Step 1: User Connects Email
```
User → OXI Fork → Login with email credentials → IMAP connection
```

### Step 2: Scan for Loyalty Emails
```
OXI Fork → IMAP SEARCH FROM "@marriott.com" → Found 12 emails
OXI Fork → IMAP SEARCH FROM "@hilton.com" → Found 8 emails
OXI Fork → IMAP SEARCH FROM "@starbucks.com" → Found 23 emails
```

### Step 3: Classify Emails (AILANG + LLM)
```
For each email:
  AILANG Parser → Extract headers + body
  Rule-based → Check sender domain + patterns
  If uncertain → LLM classifier → Get prediction
  Save (email_features, prediction) for training
```

### Step 4: Save to Loyalty Engine
```
OXI Fork → POST /api/user/memberships {
  user_id: "supabase-uuid",
  provider_id: 42,  // Marriott Bonvoy
  source: "oxi_imap",
  evidence: { email_count: 12, domain: "@marriott.com" }
}
```

### Step 5: Generate Recommendations
```
Loyalty Engine → Load user memberships + spend → ML model → Recommendations
```

---

## Implementation Plan

### Phase 1: OXI Fork (Week 1-2)
1. Fork `c0h1b4/oxi`
2. Add `loyalty_scan.rs` module (Rust backend)
3. Add "Scan" button to React frontend
4. Add D1 API client (POST memberships)
5. Deploy Docker container on contabo1
6. Test with @digid.co mailbox

### Phase 2: AILANG Parser Fork (Week 2-3)
1. Fork `sunholo-data/ailang-parse`
2. Add `loyalty/classify.ailang` module
3. Implement rule-based classifier (168 domains + patterns)
4. Add MCP server for external calls
5. Test classification accuracy

### Phase 3: LLM Learning Layer (Week 3-4)
1. Set up training pipeline (user labels → training examples)
2. Fine-tune DistilBERT on loyalty email classification
3. Integrate with AILANG parser (fallback for uncertain cases)
4. Measure accuracy improvement over time

### Phase 4: Integration (Week 4-5)
1. Connect OXI Fork → AILANG Parser → Loyalty Engine D1
2. Build dashboard UI (show detected programs)
3. Add recommendation display
4. End-to-end testing

---

## Cost Estimate

| Component | Hosting | LLM | Total |
|-----------|---------|-----|-------|
| OXI Fork | contabo1 (existing) | $0 | $0 |
| AILANG Parser | contabo1 (existing) | $0 | $0 |
| LLM Classifier | contabo1 (inference) | $5/mo (fine-tune) | $5/mo |
| Loyalty Engine | Cloudflare (free tier) | $0 | $0 |
| **Total** | | | **$5/mo** |

---

## Advantages Over Gmail OAuth

| Factor | Gmail OAuth | mail2.my + AILANG |
|--------|-------------|-------------------|
| Setup time | 6 weeks verification | 0 (IMAP is standard) |
| Provider coverage | Gmail only | Any IMAP server |
| User trust | Low (Google permission) | High (own credentials) |
| Privacy | Google sees request | Direct IMAP, no middleman |
| Learning | None (static rules) | LLM learns over time |
| Cost | $0 (Google API) | $5/mo (LLM training) |
| Complexity | OAuth flow + token refresh | IMAP auth + classification |

---

## Open Questions

1. **mail2.my Engine**: Is this an existing system or to be built? What's the provisioning model?
2. **AILANG fork**: Is there an existing fork or starting from scratch?
3. **LLM training**: Where does training data come from? User labels only, or pre-labeled dataset?
4. **Deployment**: One OXI container per user, or shared with per-user config?

---

## Next Steps

1. Clarify mail2.my Engine architecture (existing or new?)
2. Fork OXI + add loyalty scan module
3. Fork AILANG parser + add loyalty classifier
4. Set up LLM training pipeline
5. Integrate with Loyalty Engine D1
6. Build dashboard UI
