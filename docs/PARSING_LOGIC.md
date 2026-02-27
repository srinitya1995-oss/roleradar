# Parsing logic — how jobs get into the inbox

This doc shows **where** jobs come from (sources + parsers) and **why** you might not see "more jobs" on each run.

---

## 1. Source → Parser → URL (what you have today)

Seeded by `scripts/seed-top-companies.ts`. Only **enabled** sources are polled.

| Company   | Parser     | URL (what we call) |
|-----------|------------|--------------------|
| Anthropic | greenhouse | `https://boards.greenhouse.io/anthropic` |
| Adobe     | workday    | `https://adobe.wd5.myworkdayjobs.com/external_experienced` |
| Airbnb    | greenhouse | `https://boards.greenhouse.io/airbnb` |
| Uber      | greenhouse | `https://boards.greenhouse.io/uberfreight` |
| OpenAI    | ashby      | `https://jobs.ashbyhq.com/openai` |
| LinkedIn  | linkedin   | `Product Manager` (search query) |
| Adzuna    | adzuna     | `Product Manager` (search query) |
| JSearch   | jsearch    | `Product Manager` (search query) |

So **more jobs** only appear when:
- A **new** job shows up on that same URL/query (e.g. OpenAI adds a new PM role), and
- It passes **location** and **title/description gates** (see below).

We do **not** add new companies or new URLs on each run; we re-fetch the **same** sources.

---

## 2. Poll flow (one cycle)

`scripts/poll.ts` → `runPoll(forceAll)`:

1. Load all **enabled** sources from DB (`job_sources` where `enabled = 1`).
2. If not `--force`, only poll sources that are **due** (last_polled_at + tier interval).
3. For each source:
   - Call **parser(source.url)** → list of `{ title, url, location, external_id, description?, posted_at?, company? }`.
   - For each job:
     - **Dedupe:** if `external_id` already in DB for this source → skip.
     - **Location (GATE 3):** `locationEligible(location, allowed_locations, allow_remote)` → if false, skip.
     - **Gates 0,1,2,4:** `passesTitleAndDescriptionGates(title, description, allow_gpm, allow_junior_pm)` → if false, skip.
     - **Score:** `final_fit_score`, `resume_match`, then `bucket`.
     - **Insert** row into `jobs`.

So **no new rows** when every new candidate is either already in DB or fails location or gates.

---

## 3. Parser behavior (what each one returns)

### Greenhouse (`src/lib/parsers/greenhouse.ts`)

- **Input:** Board URL, e.g. `https://boards.greenhouse.io/anthropic`.
- **Call:** `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` (token = path, e.g. `anthropic`).
- **Returns:** One item per job: `title`, `absolute_url`, `location.name`, `id`, `updated_at`. **No description** in the list API.
- **Used for:** Anthropic, Airbnb, Uber (Uber Freight board).

### Ashby (`src/lib/parsers/ashby.ts`)

- **Input:** Board URL, e.g. `https://jobs.ashbyhq.com/openai`.
- **Call:** `GET https://api.ashbyhq.com/posting-api/job-board/openai`.
- **Returns:** `jobs[]` with `title`, `location`, `jobUrl`, `descriptionPlain` or `descriptionHtml`. **Has description** when API provides it.
- **Used for:** OpenAI.

### Workday (`src/lib/parsers/workday.ts`)

- **Input:** Career site URL, e.g. `https://adobe.wd5.myworkdayjobs.com/external_experienced`.
- **Call:** POST to `.../wday/cxs/{tenant}/{site}/jobs` with `{ appliedFacets: {}, limit: 20, offset: 0 }`; fallback = HTML parse of job links.
- **Returns:** `title`, `externalUrl`, `locationsText`, `id`. **No description** in the CXS response.
- **Used for:** Adobe.

### LinkedIn (`src/lib/parsers/linkedin.ts`)

- **Input:** Search query string (e.g. `Product Manager`); stored in `job_sources.url`.
- **Call:** SerpApi `engine=google_jobs`, `q={query}`. **Requires `SERPAPI_API_KEY`**.
- **Filter:** Keeps only results where `via` includes `"linkedin"`.
- **Returns:** `title`, `link`, `location`, `company_name`, `description` (when present), `job_id`, `posted_at`.
- **Used for:** LinkedIn (query = "Product Manager").

### Adzuna (`src/lib/parsers/adzuna.ts`)

- **Input:** Search query (e.g. `Product Manager`). **Requires `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`**.
- **Call:** `GET https://api.adzuna.com/v1/api/jobs/us/search/1?what=...`.
- **Returns:** `title`, `company.display_name`, `location`, `description`, `redirect_url`, `created`, `id`.

### JSearch (`src/lib/parsers/jsearch.ts`)

- **Input:** Search query (e.g. `Product Manager`). **Requires `RAPIDAPI_KEY`**.
- **Call:** `GET https://jsearch.p.rapidapi.com/search?query=...&num_pages=1`.
- **Returns:** `job_title`, `employer_name`, `job_apply_link`, `job_description`, `job_city`, `job_state`, `job_country`, `job_posted_at_*`, `job_id`.

---

## 4. Why you don’t see “more jobs” on each run

- **Same sources, same URLs:** We only re-fetch the same boards/queries. New jobs appear only when the board or search actually adds a new listing.
- **Dedupe:** Any job we’ve already stored (same source + `external_id`) is skipped. So repeated polls don’t re-insert the same roles.
- **Location:** Candidates with location that doesn’t match `allowed_locations` (after normalize) are dropped (e.g. some LinkedIn roles).
- **Gates:** Candidates whose **title** isn’t PM/senior (G0/G1/G2) or whose **description** fails GATE 4 are dropped. Most of Anthropic/OpenAI/Uber listings are non-PM (eng, research, policy), so they never get inserted.

So “more jobs” will only show up when:
1. A **new** job appears on one of these sources (same URL/query), and  
2. It passes **location** and **gates**.

To get **more jobs** you can:
- Add **new sources** (new company + parser + URL) in seed and DB.
- Widen **location** or **gates** (e.g. allow more locations, or allow junior PM) so more of the *existing* fetched candidates pass.

---

## 5. Quick reference: parser → file

| Parser          | File |
|-----------------|------|
| greenhouse      | `src/lib/parsers/greenhouse.ts` |
| ashby           | `src/lib/parsers/ashby.ts` |
| workday         | `src/lib/parsers/workday.ts` |
| linkedin        | `src/lib/parsers/linkedin.ts` |
| adzuna          | `src/lib/parsers/adzuna.ts` |
| jsearch         | `src/lib/parsers/jsearch.ts` |
| lever           | `src/lib/parsers/lever.ts` |
| smartrecruiters | `src/lib/parsers/smartrecruiters.ts` |

Poll loop and dedupe/location/gates: `scripts/poll.ts` (see §2 above).
