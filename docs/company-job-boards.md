# Top Company Job Boards – Parser Support

**Canonical fetch strategy (company tiers, polling frequency, platform types, pre-filtering):** see **[JOB_SOURCE_FETCHING_V2_SPEC.md](JOB_SOURCE_FETCHING_V2_SPEC.md)**.

Below: current parser support snapshot. Checked career pages for: Netflix, Adobe, Airbnb, Uber, TikTok, Google, Meta, Anthropic, OpenAI, Apple.

---

## Supported (have parser + URL)

| Company    | Parser           | Job board URL |
|-----------|------------------|----------------|
| **Anthropic** | greenhouse   | `https://boards.greenhouse.io/anthropic` |
| **Adobe**    | workday      | `https://adobe.wd5.myworkdayjobs.com/external_experienced` |
| **Airbnb**   | greenhouse   | `https://boards.greenhouse.io/airbnb` |
| **Uber** (Uber Freight) | greenhouse | `https://boards.greenhouse.io/uberfreight` |
| **OpenAI**   | ashby        | `https://jobs.ashbyhq.com/openai` |

---

## Not supported (custom / proprietary)

We **don’t have parsers** for these. Their career sites use custom or proprietary systems; adding them would require building a new parser or using headless discovery (see JOB_SOURCE_FETCHING_V2_SPEC.md § TYPE 4).

| Company    | Careers URL              | Notes |
|------------|--------------------------|--------|
| **TikTok** | careers.tiktok.com, joinbytedance.com | ByteDance custom. |
| **Apple**  | jobs.apple.com           | Proprietary job portal. |
| **Google** | careers.google.com       | Own system (post–Google Hire). |
| **Microsoft** | careers.microsoft.com | Custom careers portal. |
| **Intuit** | intuit.com/careers, jobs.intuit.com | Custom platform. |
| **Netflix** | jobs.netflix.com → explore.jobs.netflix.net | Custom platform. |
| **Meta**   | metacareers.com, facebookcareers.com | Custom careers portal. |

---

## Adding supported companies

Use the parser and URL from the table above. Example: add Adobe (Workday) and OpenAI (Ashby) in the DB or via a seed script:

- **Adobe:** `parser = 'workday'`, `url = 'https://adobe.wd5.myworkdayjobs.com/external_experienced'`
- **OpenAI:** `parser = 'ashby'`, `url = 'https://jobs.ashbyhq.com/openai'`
- **Airbnb:** `parser = 'greenhouse'`, `url = 'https://boards.greenhouse.io/airbnb'`
- **Uber (Freight):** `parser = 'greenhouse'`, `url = 'https://boards.greenhouse.io/uberfreight'`

Note: Uber’s main careers (jobs.uber.com) may use a different backend; only Uber Freight is confirmed on Greenhouse.
