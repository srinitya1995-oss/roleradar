# Job Source Fetching V2 — Precision Company Ingestion

**Canonical spec for which companies to fetch, polling frequency, platform-specific fetch strategy, and fetch-time filtering. Current poll/seed logic is legacy; migrate to this spec.**

---

================================================================================
GOAL
================================================================================

Fetch jobs from companies that match Srinitya's career targets,
NOT merely companies with easy parsers.

The system must prioritize TARGET COMPANIES first,
then apply parsing strategies per platform type.

--------------------------------------------------------------------------------
A) COMPANY PRIORITY TIERS
--------------------------------------------------------------------------------

TIER 1 — MUST FETCH (HIGH PRIORITY)
Consumer + AI platform leaders aligned with resume.

- Microsoft
- Google
- LinkedIn
- Uber
- Airbnb
- OpenAI
- Anthropic
- Intuit
- Pinterest
- Apple
- Meta
- Netflix
- Amazon (selected orgs only)

**Polling frequency:** Every 30 minutes

--------------------------------------------------------------------------------
TIER 2 — STRATEGIC CONSUMER AI
--------------------------------------------------------------------------------

- DoorDash
- Instacart
- Expedia
- Snap
- YouTube
- Adobe
- Figma
- Notion
- Stripe
- Shopify
- Block
- CashApp

**Polling frequency:** Every 2 hours

--------------------------------------------------------------------------------
TIER 3 — OPTIONAL EXPLORATION
--------------------------------------------------------------------------------

AI startups using:
- Greenhouse
- Ashby
- Lever

**Polling frequency:** Daily

--------------------------------------------------------------------------------
B) FETCH STRATEGY BY CAREER PLATFORM TYPE
--------------------------------------------------------------------------------

The system must support MULTIPLE ingestion modes.

----------------------------------------------------------------
TYPE 1 — GREENHOUSE
----------------------------------------------------------------
Use existing parser.

Examples: Anthropic, Airbnb, Uber Freight

----------------------------------------------------------------
TYPE 2 — ASHBY
----------------------------------------------------------------
Use existing parser.

Examples: OpenAI, Notion, Figma

----------------------------------------------------------------
TYPE 3 — WORKDAY
----------------------------------------------------------------
Use Workday JSON endpoints.

**IMPORTANT:** Do NOT scrape HTML. Query Workday API endpoints directly.

Example:
`https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced/jobs`

Extract:
- title
- location
- posted date
- job_id
- description
- req level

----------------------------------------------------------------
TYPE 4 — CUSTOM ENTERPRISE CAREERS (CRITICAL ADD)
----------------------------------------------------------------

For companies WITHOUT parsers:

- Google
- Meta
- Apple
- Netflix
- TikTok
- Microsoft
- LinkedIn
- Uber main careers

Use **HEADLESS DISCOVERY MODE**.

Implementation:

1. Load careers search page via Playwright.
2. Execute job search query: "product manager"
3. Capture network requests.
4. Detect underlying JSON API used by frontend.
5. Persist API endpoint.
6. Poll API directly thereafter.

**Never rely on DOM scraping.**

Cache discovered endpoints per company.

--------------------------------------------------------------------------------
C) ROLE PRE-FILTERING AT FETCH TIME
--------------------------------------------------------------------------------

**Immediately discard** roles where title contains:

- intern
- contract
- designer
- marketing
- sales
- program manager (non-product)
- TPM
- operations
- HR

**Only ingest** titles containing (at least one):

- product manager
- product lead
- principal product
- AI product
- ML product
- GenAI
- Agentic
- Personalization
- Discovery
- Consumer

--------------------------------------------------------------------------------
D) DATE RECENCY FIX (MAJOR ISSUE)
--------------------------------------------------------------------------------

**Replace:**
- `created_at >= 30 days`

**With:**
- `posted_date <= 21 days`

**And BOOST:**
- `<= 72 hours`

**Reason:** High-signal roles fill early.

--------------------------------------------------------------------------------
E) COMPANY SIGNAL ENRICHMENT
--------------------------------------------------------------------------------

For each fetched job attach:

- company_tier
- consumer_score
- ai_intensity_score
- resume_company_affinity
- amazon_alumni_density

Example:
- Uber → consumer_score = HIGH
- Intuit AI → ai_intensity = HIGH

--------------------------------------------------------------------------------
F) LINKEDIN DISCOVERY AUGMENTATION
--------------------------------------------------------------------------------

After ingestion:

Search LinkedIn automatically:

- "[Company] hiring product manager"
- "[Team] expanding"
- "We're hiring PM"

Extract:
- hiring manager names
- recruiter posts
- org announcements

Attach to job object: `hiring_signals[]`

--------------------------------------------------------------------------------
G) FETCH SUCCESS METRIC
--------------------------------------------------------------------------------

**System success =**

> 70%+ surfaced roles belong to Tier 1 companies

If majority of jobs come from random Greenhouse startups,
fetch strategy has failed.
