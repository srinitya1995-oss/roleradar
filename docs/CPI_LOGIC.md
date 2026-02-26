# CPI (Candidate–Role Fit Index) Logic

Source: `src/lib/cpi.ts`

## CPI overview

- **Scale:** 0–10
- **Formula:** CPI = **Role Fit (0–5)** + **AI Depth (0–5)**
- **Conditions:** Only scored if the title passes hard exclusion, contains "product", and Role Fit ≥ 3. Otherwise CPI = 0.

---

## Layer 1 — Hard exclusion (title)

If the **title** (case-insensitive) contains any of these, **CPI = 0** (no scoring):

- engineer, scientist, research, finance, sales, marketing, hr, legal, operations, director, head, vp

---

## Layer 2 — Must be product

- Title must contain **"product"** (case-insensitive).
- If not → **CPI = 0**.

---

## Layer 3 — Role Fit score (0–5)

Scored from the **description** only. Up to **1 point per group** (max 5), by presence of any phrase in that group:

| Group | Example phrases |
|-------|-----------------|
| 1 | product ownership, product owner, own the product, ownership of product |
| 2 | roadmap, roadmaps, roadmap ownership |
| 3 | kpi, metrics, okr, key result, measure success, metrics ownership |
| 4 | cross-functional, cross functional, stakeholder, leadership, partner with engineering |
| 5 | 0 to 1, zero to one, 0-to-1, launch, launched, from scratch, greenfield |

- If **Role Fit < 3** → **CPI = 0** (no scoring).
- Otherwise Role Fit is used in the sum below.

---

## Layer 4 — AI Depth score (0–5)

Also from the **description**. Count **distinct terms** present (cap at 5):

- generative ai, genai, gen ai, llm, language model, large language  
- conversational ai, assistant, copilot, reasoning, evaluation, safety, personalization, multimodal  

---

## Final CPI and tier

```
CPI = clamp(Role Fit + AI Depth, 0, 10)
```

**Tier (from CPI):**

- **9–10** → Top 5%
- **7–8**  → Top 20%
- **< 7**  → Reject

So: **hard exclusion + "product" in title + Role Fit ≥ 3** are required; then CPI = Role Fit + AI Depth, and tier is derived from that score as above.
