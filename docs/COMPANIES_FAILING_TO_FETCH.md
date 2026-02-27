# Companies failing to get jobs

Based on the last agent/poll run. Two kinds of failure:

---

## 1. **Zero jobs fetched** (parser returns 0)

We don’t get any listings from the source at all.

| Company | Parser   | Cause |
|---------|----------|--------|
| **Adobe**  | Workday  | Board returns 0 jobs (CXS may not be used; list page may be JS-rendered). |
| **Airbnb**  | Greenhouse | Board may be empty, wrong URL, or request failing. |

**Fix options:**  
- **Adobe:** Workday list isn’t usable today; would need different API or JS rendering (e.g. headless).  
- **Airbnb:** Confirm URL `https://boards.greenhouse.io/airbnb` and that the board returns jobs in a browser; check network/errors in poll.

---

## 2. **Jobs fetched but 0 inserted** (all filtered by location or gates)

We get listings but every one is dropped by location or title/description gates.

| Company    | Fetched | Failed location | Failed gates | New |
|------------|---------|------------------|--------------|-----|
| **Anthropic** | 50  | 0   | 50 | 0 |
| **Uber**      | 40  | 0   | 39 | 0 |
| **OpenAI**    | 596 | 99  | 487 | 0 |
| **LinkedIn**  | 1   | 1   | 0  | 0 |

**Cause:**  
- **Location:** Job location not in allowed list (e.g. not “United States” / “Remote” / “USA” / “US” or your configured list).  
- **Gates:** Title/description don’t pass PM-related gates (e.g. no “Product”, “PM”, “Technical”, “Senior”, etc. in the right way).

**Fix options:**  
- Broaden **allowed_locations** or **allow_remote** in settings if you want more locations.  
- Relax or adjust gates in `src/lib/gates.ts` (e.g. allow more title patterns).  
- Run `npx tsx scripts/poll-debug-gates.ts <Company>` to see why specific jobs fail gates.

---

## Quick reference: source → company

| Source (company) | Parser    | URL |
|------------------|-----------|-----|
| Anthropic        | greenhouse | https://boards.greenhouse.io/anthropic |
| Adobe            | workday    | https://adobe.wd5.myworkdayjobs.com/external_experienced |
| Airbnb           | greenhouse | https://boards.greenhouse.io/airbnb |
| Uber             | greenhouse | https://boards.greenhouse.io/uberfreight |
| OpenAI           | ashby      | https://jobs.ashbyhq.com/openai |
| LinkedIn         | linkedin   | (SerpApi; search query from source url) |

To regenerate this view, run `npm run poll -- --force` and read the log lines per company.
