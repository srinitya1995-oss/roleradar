# Job matching logic — full specification

This document is the single source of truth for how jobs are filtered (gates), scored, and bucketed. Use it to vet behavior against another system (e.g. Gemini).

---

## 1. Pipeline order (poll / ingest)

When a job is fetched from any source (Greenhouse, LinkedIn, JSearch, etc.), the following steps run **in order**. The job is **stored only if** it passes every step; otherwise it is discarded and never appears in the UI.

1. **Dedupe:** If `external_id` for this source already exists in DB → skip (counted as "already in DB").
2. **GATE 3 — Location:** `locationEligible(location, allowed_locations, allow_remote)` (see §2). If false → skip ("failed location").
3. **GATE 0, 1, 2, 4 — Title & description:** `passesTitleAndDescriptionGates(title, description, allow_gpm, allow_junior_pm)` (see §3). If false → skip ("failed gates").
4. **Score:** Compute `final_fit_score` (§4) and `resume_match` (§5).
5. **Bucket:** `computeBucket(resume_match, final_fit_score)` (§6).
6. **Store:** Insert row with title, location, url, description, final_fit_score, resume_match, bucket, company (if from API).

No job is stored if it fails step 2 or 3. Steps 4–6 run only for jobs that passed 2 and 3.

---

## 2. GATE 3 — Location

**Function:** `locationEligible(location, allowedLocations, allowRemote)`  
**Inputs:** Raw location string (e.g. "San Francisco, CA", "Remote", ""), list of allowed location substrings, boolean allow_remote.  
**Output:** true = job is location-eligible; false = discard.

**Logic:**

- If `location` is null/empty/whitespace → return **true** (no location = allow).
- **Parse location:**
  - `raw_location` = trim(location).
  - `is_remote` = raw contains "remote" or "anywhere" (case-insensitive).
  - `is_hybrid` = raw contains "hybrid".
  - `is_remote_only` = true if:
    - Raw matches one of: `^\s*remote\s*$`, `^\s*remote\s*-\s*us\s*$`, `^\s*us\s+remote\s*$`, `^\s*anywhere\s*$`, `^\s*remote\s*,\s*usa\s*$` (regex, case-insensitive), **or**
    - `is_remote && !is_hybrid` and raw does **not** contain any of: "san francisco", "sf", "seattle", "la", "los angeles", "bellevue", "redmond", "california", "ca".
- **If `is_remote_only`:**
  - `allowedByList` = any entry in `allowedLocations` (trimmed, lowercased) is a non-empty string and `raw_location.toLowerCase().includes(that entry)`.
  - Return **true** if `allowRemote === true` **or** `allowedByList === true`; else **false**.
- **Else (has a non-remote or hybrid location):**
  - Return **true** iff `raw_location.toLowerCase()` includes at least one trimmed, lowercased entry from `allowedLocations` (substring match).

**Default settings (from code):**

- `allow_remote`: **false** (env `ALLOW_REMOTE` or settings.json).
- `allowed_locations`:  
  `["CA", "California", "Seattle", "San Francisco", "SF", "Los Angeles", "LA", "Bellevue", "Redmond", "Seattle, WA", "San Francisco, CA", "Los Angeles, CA", "Bellevue, WA", "Redmond, WA", "Remote", "New York", "NYC", "Boston", "Austin", "Denver"]`.

So with defaults, a job whose location is **only** "Remote" or "Anywhere" (and no city) is allowed only if "Remote" is in the list (it is) and the check is `parsed.raw_location.toLowerCase().includes(a)`: e.g. "remote" includes "remote" → allowed. If the API returns something like "United States" or "India" with no city in our list, the job fails location.

---

## 3. GATE 0, 1, 2, 4 — Title and description

**Function:** `passesTitleAndDescriptionGates(title, description, allowGpm, allowJuniorPm)`  
**Inputs:** Job title, job description, allow GPM (group product manager), allow junior PM.  
**Output:** true = pass (continue to scoring); false = discard.

**Normalization:** Title and all keyword lists are **normalized** before comparison: replace → with " to ", hyphens with space, strip `+ $ ( )` and other non-word chars, collapse whitespace, lowercase. So "0→1" and "0-to-1" both match.

**GATE 0 — Hard title exclusion**

- If title is null/empty/whitespace → return **false**.
- If **normalized** title **contains** (substring) **any** normalized exclusion term → return **false**:
  - "intern", "contract", "designer", "engineer", "developer", "scientist", "research", "sales", "account", "marketing", "product marketing", "pmm", "finance", "revenue", "tax", "accounting", "operations", "procurement", "sourcing", "solutions engineer", "deployment", "success engineer", "forward deployed", "program manager", "technical program manager", "project manager", "assistant", "business partner", "compliance", "legal", "hr".

**GATE 1 — Must be PM role**

- **Normalized** title **must contain** at least **one** normalized term from: "product manager", "product management", "technical product manager", "pm-t", "pmt", "product lead", "principal product", "ai product", "ml product", "genai", "gen ai", "agentic", "personalization", "discovery", "consumer".
- If `allowGpm === true`, also allow: "group product manager".
- Else → return **false**.

**GATE 2 — Seniority** (skipped when `allowJuniorPm === true`)

- **Normalized** title **must contain** at least **one** of: "senior", "sr.", "sr ", "principal", "staff".
- Else → return **false**.

**GATE 4 — Description sanity (avoid pure eng roles)**

- If description is null/empty/whitespace → **true** (allow).
- **Bypass:** If **normalized** title contains **any** of: "technical", "pm-t", "pmt", "senior" → **true** (no eng-keyword penalty).
- Else: count **total occurrences** in **normalized** description of: "code", "coding", "python", "java", "c++", "implementation", "debugging".
- Strategy: **normalized** description contains normalized "product strategy" or "roadmap" → `hasStrategy = true`.
- If `engCount > 5` **and** `!hasStrategy` → return **false**; else **true**.

**Defaults:** `allow_gpm` = false, `allow_junior_pm` = false (env `ALLOW_GPM`, `ALLOW_JUNIOR_PM` or settings.json).

---

## 4. Final fit score (0–100)

**Function:** `computeFinalFitScore(title, description)`  
**Input:** Job title and description.  
**Output:** Integer in [0, 100].

**Formula:**  
`final_fit_score = clamp( roleRelevance(description) + aiDepth(description) + domainFit(description) - penalty(title, description) , 0, 100 )`  
All term matches are **case-insensitive** on the combined or single text. For each keyword group below: if the text **contains** (substring) **any** keyword in that group, add that group’s points. Multiple groups can contribute; the component total is then capped.

**4.1 Role relevance (description only; cap 40)**

For each row, if description contains any of the listed phrases, add the points (then cap at 40):

| Points | Any of these in description |
|--------|------------------------------|
| 8 | "product ownership", "own the product", "product owner", "ownership of product" |
| 6 | "roadmap", "roadmaps", "roadmap ownership", "strategic roadmap" |
| 6 | "kpi", "metrics", "okr", "key result", "measure success", "metrics ownership", "experimentation" |
| 6 | "cross-functional", "cross functional", "stakeholder", "partner with engineering", "leadership" |
| 5 | "0 to 1", "zero to one", "0-to-1", "launch", "from scratch", "greenfield" |
| 5 | "platform", "api", "primitives", "sdk", "developer experience", "surface", "end-to-end" |
| 4 | "vision", "strategy", "north star", "multi-year" |

Total capped at 40.

**4.2 AI depth (description only; cap 30)**

Same rule: for each group, any keyword match adds that group’s points; total capped at 30:

| Points | Any of these in description |
|--------|------------------------------|
| 6 | "generative ai", "genai", "gen ai", "llm", "language model", "large language" |
| 4 | "model behavior", "frontier model", "fine-tune", "fine tune", "post-training" |
| 4 | "evaluation", "eval", "evaluation methodology", "red team", "red teaming" |
| 3 | "reasoning", "alignment", "safety", "reliability" |
| 4 | "conversational ai", "assistant", "copilot", "personalization", "multimodal" |
| 4 | "agentic", "agents", "retrieval", "rag", "retrieval-augmented" |
| 3 | "ml experimentation", "machine learning", "ml product" |

Capped at 30.

**4.3 Domain fit (description only; cap 20)**

Same rule; total capped at 20:

| Points | Any of these in description |
|--------|------------------------------|
| 5 | "conversational", "conversational ai", "dialogue" |
| 4 | "evaluation", "eval", "reasoning framework" |
| 3 | "multimodal", "multimodal experiences" |
| 3 | "platform", "api", "developer-facing", "primitives" |
| 3 | "personalization", "recommendation", "discovery" |
| 2 | "experimentation", "a/b", "at scale" |

Capped at 20.

**4.4 Penalty (title + description combined; cap 30)**

Same rule over concatenated title + description; total penalty capped at 30:

| Points | Any of these in title+description |
|--------|-----------------------------------|
| 15 | "product marketing", "pmm", "go-to-market", "gtm" |
| 10 | "entry level", "junior", "associate product manager" |
| 10 | "hands-on unity", "game dev", "gaming required", "unity engine" |
| 5 | "pure operations", "non-product ops" |

Penalty total capped at 30. Final: `raw = role + ai + domain - penalty`, then `round(clamp(raw, 0, 100))`.

---

## 5. Resume match (0–100)

**Function:** `profileMatchScore(jobTitle, jobDescription, profile)`  
**Input:** Job title, job description, and a fixed candidate profile (surfaces + backgroundKeywords).  
**Output:** Integer in [0, 100].

**Text:** `text = (jobTitle + " " + jobDescription).toLowerCase()`. If empty → return 0.

**Profile (hardcoded in code):**

- **surfaces:** ["Alexa Generative AI", "conversational shopping", "reasoning infrastructure", "multimodal experiences", "evaluation frameworks", "LLM-powered surfaces", "Amazon Rufus"]
- **backgroundKeywords:** ["ex-Amazon", "ex Amazon", "PM-T", "Principal PM", "Senior PM", "GenAI", "generative AI", "conversational AI", "LLM", "reasoning", "evaluation", "multimodal", "0-to-1", "product roadmap", "cross-functional"]

**Logic (semantic matcher: normalization, synonyms, category surfaces):**

- **Normalization:** Text is normalized (→ to " to ", hyphens to space, strip +$(), lowercase) before matching.
- **Keyword score (60 max):** Each background keyword matches if normalized text contains it or any **synonym** (GenAI = generative ai = llm; 0→1 = 0-to-1 = zero to one = launch; PM-T = technical product manager = pmt). Fuzzy token match (tokens within distance) also counts.
- **Surface score (40 max):** **Alias-based.** If normalized JD contains **any** alias from a surface category, that surface gets 1 hit. Aliases:
  - **Amazon Rufus:** shopping, e-commerce, ecommerce, consumer ai, retail, commerce
  - **Alexa Generative AI:** agentic, assistant, llm reasoning, multi-step, multistep, conversational ai, voice ai, alexa
  - **conversational shopping:** conversational, shopping, e-commerce, ecommerce, commerce
  - **reasoning infrastructure:** reasoning, infrastructure, inference, multi-step, multistep
  - **multimodal experiences:** multimodal, vision, language, experience, experiences
  - **evaluation frameworks:** benchmarks, red teaming, red team, accuracy metrics, evals, evaluation, eval
  - **LLM-powered surfaces:** llm, generative, language model, surface, surfaces, product
- `score` = keywordScore + surfaceScore; return `round(clamp(score, 0, 100))`.

No LLM; deterministic.

---

## 6. Bucket assignment

**Function:** `computeBucket(resumeMatch, finalFitScore)`  
**Input:** resume_match and final_fit_score (both 0–100).  
**Output:** One of APPLY_NOW | STRONG_FIT | NEAR_MATCH | REVIEW | HIDE.

**Rules (evaluated in order; calibrated for keyword-based matcher):**

1. If `resumeMatch >= 80` **and** `finalFitScore >= 80` → **APPLY_NOW**.
2. Else if `resumeMatch >= 70` **and** `finalFitScore >= 75` → **STRONG_FIT**.
3. Else if `resumeMatch >= 60` **and** `finalFitScore >= 65` → **NEAR_MATCH**.
4. Else if `resumeMatch >= 50` → **REVIEW** (no fit threshold).
5. Else → **HIDE**.

---

## 7. Summary table

| Stage | What happens | If fail |
|-------|----------------------------|---------|
| Dedupe | external_id already in DB for this source | Skip (not stored) |
| Location | locationEligible(...) | Skip ("failed location") |
| Gates 0,1,2,4 | passesTitleAndDescriptionGates(...) | Skip ("failed gates") |
| Score | final_fit_score, resume_match | — |
| Bucket | computeBucket(resume_match, final_fit_score) | — |
| Store | Insert row with bucket | — |

Only jobs that pass location and title/description gates are stored. Bucket and scores only affect how the job is labeled and shown (Apply now / Strong fit / Near match / Review / Hidden), not whether it is stored.

---

## 8. Settings that affect matching

| Setting | Default | Effect |
|---------|---------|--------|
| ALLOW_REMOTE | false | Remote-only jobs: need allow_remote true or "Remote" in allowed_locations (default list includes "Remote"). |
| ALLOWED_LOCATIONS | (list in §2) | Location must match (substring) one of these, or pass remote-only rule. |
| ALLOW_GPM | false | If true, "group product manager" is allowed in GATE 1. |
| ALLOW_JUNIOR_PM | false | If true, GATE 2 (seniority) is skipped. |

All matching is deterministic and keyword-based; no LLM is used in gates, scoring, or bucketing.
