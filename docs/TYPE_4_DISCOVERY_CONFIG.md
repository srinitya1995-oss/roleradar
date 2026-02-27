# Type 4 Custom Boards — Discovery Config & Agent Instructions

Use this as the agent’s **Custom Sources** / discovery config for companies without parsers (Apple, Google, Microsoft, Meta, Netflix, Intuit, TikTok).

---

## 1. Solid "Big Tech" Seed Data

Custom Enterprise targets that match your profile. Add these URLs and **targeted keyword queries** to your seeding script so the agent pulls relevant data.

| Company   | Target Team / Product        | Targeted Keyword Query                          | Why it's a 95%+ Match |
|-----------|------------------------------|--------------------------------------------------|------------------------|
| Apple     | Apple Intelligence & Siri    | Senior Product Manager Apple Intelligence Siri  | Matches your 89%→99% accuracy work on conversational reasoning and Siri's agentic capabilities. |
| Google    | Gemini / Shopping            | Senior Product Manager Gemini Retail CX          | Direct 1:1 match for your Amazon Rufus (conversational shopping) experience. |
| Microsoft | Copilot Consumer (MAI)      | Principal Product Manager Copilot Consumer Search| Matches your work on multimodal discovery and 0→1 consumer search experiences. |
| Netflix   | Personalization & Discovery  | AI Product Manager Personalization Discovery     | Matches your 92% recommendation relevancy success and content discovery strategy. |
| TikTok    | TikTok Shop AI               | Product Manager TikTok Shop User Product         | Matches your consumer-facing discovery and shopping agent work. |

*(Meta, Intuit: see programmatic config; same seed-query pattern.)*

---

## 2. High-Fit Logic (Consumer AI Rules)

To stop the agent from discarding these roles, `src/lib/` uses:

### A. GATE 1 — Must-Have Title Keywords

In **`src/lib/gates.ts`**, GATE 1 includes these so the agent doesn’t miss newer "Agentic" or "Multimodal" titles:

`Siri`, `Apple Intelligence`, `Gemini`, `Copilot`, `Search`, `Shopping`, `Assistant`, `Discovery`, `Multimodal`

*(“Assistant” was removed from GATE 0 exclusions so AI-assistant PM roles pass.)*

### B. Surface Alias Mapping ("Pedigree" Bonus)

In **`src/lib/profile.ts`**, the agent gives you credit for Amazon achievements when it sees these competitor keywords:

| If JD mentions…              | Score as…                |
|-----------------------------|---------------------------|
| Siri, Assistant, Agentic   | Conversational Reasoning (Alexa AI) |
| Shopping, Retail, Discovery, Commerce | Amazon Rufus        |
| Benchmarks, Metrics, Accuracy | Evaluation Frameworks   |

---

## 3. Immediate "APPLY NOW" Targets (Feb 2026)

If the agent is working correctly, these should be at the top of your list:

| Company   | Role | Focus |
|-----------|------|--------|
| **Apple**   | Senior Product Manager, Apple Intelligence and Siri | Launching AI experiences across operating systems. Matches your Alexa 3-Year Vision work. |
| **Netflix** | AI Product Manager, Content Platform Operations     | Transforming internal tools and consumer content operations. Matches your multimodal interface expertise. |
| **Microsoft** | Principal Product Manager, Copilot Studio         | Monetization and usage of agentic experiences. Matches your $79M revenue contribution and transaction growth experience. |

---

## 4. High-Value "Consumer-Facing" Roles (Feb 2026) — Referral Paths

| Company  | Role / Focus | Referral Path |
|----------|----------------|----------------|
| **Google** | PM, Gemini CX — "Google Shopping Agent" | Search for ex-Amazon Alexa PMs now at Google. |
| **Apple**   | Senior PM, Siri Consumer Intelligence (Agentic AI in apps) | Use the 250+ JHU alumni at Apple. |
| **Netflix** | AI Product Manager, Streaming Discovery | Target PMs in "Member Experience" or "Search Engineering." |

---

## 5. Smart Logic Instructions for the Agent

Give these instructions to the agent for **Custom** (Type 4) boards:

### Headless Discovery Protocol (Apple, Google, Meta)

1. **Navigate** to the provided Discovery URL (careers search page).
2. **Intercept the JSON response** in the network traffic to bypass SPA (Single Page App) rendering.
3. **Do not rely on DOM scraping** — use the underlying API once discovered.
4. Persist the discovered API endpoint per company and poll it directly thereafter.

### Alias Matching (company-aware)

- **Apple + "Siri"** → Map to my **Alexa AI** surface (conversational / assistant / reasoning).
- **Google + "Shopping"** (or "Gemini CX", "Shopping Agent") → Map to my **Amazon Rufus** surface (shopping / consumer AI).
- **Meta + "Llama" / "Multimodal"** → Map to my **Alexa multimodal** surface.

When scoring or bucketing jobs from these companies, treat these aliases as strong surface fit so APPLY_NOW/STRONG_FIT logic surfaces them.

---

## Programmatic config

- **`src/lib/type4-discovery-config.ts`** — `TYPE_4_SOURCES` (Solid Big Tech seed table), `HIGH_VALUE_CONSUMER_ROLES`, `APPLY_NOW_TARGETS_FEB_2026`, `TYPE_4_AGENT_INSTRUCTIONS`.
- **`src/lib/gates.ts`** — GATE 1 includes Siri, Apple Intelligence, Gemini, Copilot, Search, Shopping, Assistant, Discovery, Multimodal.
- **`src/lib/profile.ts`** — Surface aliases: Siri/Assistant/Agentic → Alexa; Shopping/Retail/Discovery/Commerce → Rufus; Benchmarks/Metrics/Accuracy → Evaluation Frameworks.
