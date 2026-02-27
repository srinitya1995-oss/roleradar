# Job listing APIs used by Role Radar

Role Radar can pull jobs from company career pages (Greenhouse, Workday, Ashby, etc.) and from these external job APIs when keys are set. **No Claude or other LLM is required** for any of these — they are plain REST APIs.

---

## 1. JSearch (RapidAPI) — recommended, popular

- **Use:** Single API that aggregates jobs from **LinkedIn, Indeed, ZipRecruiter, Glassdoor, Monster**, and more (Google for Jobs + web).
- **Env:** `RAPIDAPI_KEY` (subscribe to JSearch on RapidAPI; same key works). Optional: `RAPIDAPI_JSEARCH_HOST` if the default host differs.
- **Sign up:** [RapidAPI – JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) — free tier: 200 requests/month.
- **Parser:** `jsearch` — source `url` = search query (e.g. "Product Manager").
- **Seed:** `npm run seed-top-companies` adds a "JSearch" source.

---

## 2. SerpApi (Google Jobs → LinkedIn filter)

- **Use:** LinkedIn jobs via Google Jobs results.
- **Env:** `SERPAPI_API_KEY`
- **Sign up:** [serpapi.com](https://serpapi.com) (free tier available).
- **Parser:** `linkedin` — source `url` = search query (e.g. "Product Manager"). Only results with `via=LinkedIn` are kept.
- **Seed:** `npm run seed-top-companies` adds a "LinkedIn" source with query "Product Manager".

---

## 3. Adzuna

- **Use:** General job search (US by default).
- **Env:** `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`
- **Sign up:** [developer.adzuna.com/signup](https://developer.adzuna.com/signup) (free).
- **Parser:** `adzuna` — source `url` = search query (e.g. "Product Manager"). Fetches from Adzuna’s US job index.
- **Seed:** `npm run seed-top-companies` adds an "Adzuna" source with query "Product Manager".

---

## 4. Other APIs you can add

| API | Notes | Env / signup |
| **JobData API** | Niche/PM job feeds, backfill. | [jobdataapi.com](https://jobdataapi.com) — subscription; add parser + source. |
| **APIJobs.dev** | 3M+ jobs, search/filter. | Free tier; add parser for their REST API. |
| **Indeed** | Partner API (postings, employers). | [docs.indeed.com](https://docs.indeed.com) — partner signup. |

To add a new API:

1. Add a parser in `src/lib/parsers/<name>.ts` that returns `ParsedJob[]` (same shape as LinkedIn/Adzuna).
2. Register it in `scripts/poll.ts` in the `parsers` object.
3. Add a job source (e.g. in `scripts/seed-top-companies.ts` or via DB) with `parser: "<name>"` and `url` = query or API-specific params.
4. Document required env vars in this file and in `.env.example` if you have one.
