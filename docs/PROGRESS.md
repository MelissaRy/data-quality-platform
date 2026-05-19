# Data Quality Observability Platform — Progress & Context

## What this project is

A portfolio project (potential SaaS) that monitors data quality across mock enterprise data sources and surfaces issues via a React dashboard with an AI-assisted chat interface.

## Stack

| Layer | Technology |
|---|---|
| Mock data sources | Python generators — HR, Finance, Sales |
| Metrics store | PostgreSQL |
| Lineage graph | Neo4j |
| API | FastAPI |
| Dashboard | React + Recharts + React Flow |
| AI interface | Claude Haiku 4.5 with prompt caching |

## Phase status

- [x] **Phase 1** — Mock data generators (`generators/`)
- [ ] **Phase 2** — PostgreSQL metrics store + quality check pipeline
- [ ] **Phase 3** — Neo4j lineage graph
- [ ] **Phase 4** — FastAPI API
- [ ] **Phase 5** — React dashboard + AI chat interface
- [ ] **Phase 6** — Deployment (Render/Railway + Neo4j Aura free tier)

---

## Phase 1 detail — COMPLETE

Three generators in `generators/` produce realistic data with intentional quality issues:

### HR (`generators/hr.py`)
Simulates an HRIS export. Produces ~525 rows (500 base + ~5% duplicates).

| Issue | Rate | Description |
|---|---|---|
| Missing manager | ~8% | New hires not yet assigned |
| Duplicate records | ~5% | System migration artefact |
| Stale `last_updated` | ~10% | Batch job that ran late (30–180 days old) |
| Invalid email format | ~3% | Manual entry errors (no `@`) |
| Future hire date | ~4% | Data entry mistakes |

### Finance (`generators/finance.py`)
Simulates a GL/ERP transaction export. Produces ~3,210 rows (3,000 + ~7% duplicates).

| Issue | Rate | Description |
|---|---|---|
| Null cost centre | ~6% | Field not mapped in legacy ERP |
| Duplicate transaction IDs | ~7% | Reconciliation system bug |
| Negative invoices | ~5% | Sign convention mismatch |
| Implausible expense amounts | ~4% | >€1M expense (likely data entry) |
| Missing currency | ~8% | Default assumed but not recorded |

### Sales (`generators/sales.py`)
Simulates a CRM export. Produces ~872 customers (800 + ~9% duplicates) and 600 deals.

| Issue | Rate | Description |
|---|---|---|
| Duplicate customers | ~9% | Merged from two CRM systems |
| Close date before created date | ~6% | Data migration error |
| Missing deal owner | ~5% | Reassignment gap |
| Invalid pipeline stage | ~7% | Old picklist values not cleaned |
| Closed Won with zero revenue | ~4% | Quote not synced |

### Shared
- `shared/config.py` — `DB_URL`, `SEED`, record count constants
- `scripts/generate_all.py` — runs all three generators, prints row counts

Run to verify: `python scripts/generate_all.py`

---

## Phase 2 — next to build

### Goal
Run quality checks against the generated data and store scored results in PostgreSQL.

### PostgreSQL schema (to create)
```
sources          — id, name, system_type, description
quality_runs     — id, source_id, run_at, status
quality_metrics  — id, run_id, dimension, field, score (0–1), issue_count, total_count, detail
```

### Quality dimensions to implement (per source)
| Dimension | What to check |
|---|---|
| Freshness | Max age of `last_updated` / `posted_date` vs threshold |
| Completeness | % non-null for required fields |
| Uniqueness | Duplicate rate on key fields (employee_id, transaction_id, customer_id) |
| Consistency | e.g. close_date >= created_date; amount > 0 for Invoices |
| Validity | Email format, allowed enum values (stage, currency), date plausibility |

### Files to create
```
db/schema.sql            — CREATE TABLE statements
db/bootstrap.py          — connects to PG and runs schema.sql
checks/hr_checks.py      — quality check functions for HR data
checks/finance_checks.py — quality check functions for Finance data
checks/sales_checks.py   — quality check functions for Sales data
checks/runner.py         — orchestrates: generate → check → store results
```

### How to run (target)
```bash
# Start PostgreSQL (Docker)
docker run -d --name dqp-pg -e POSTGRES_USER=dqp -e POSTGRES_PASSWORD=__REDACTED__ \
  -e POSTGRES_DB=dqp -p 5432:5432 postgres:16

# Bootstrap schema
python db/bootstrap.py

# Run quality checks and store results
python checks/runner.py
```

---

## AI interface design (Phase 5)

- **Model**: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — cheapest, ~$1/1M input tokens
- **Prompt caching**: system prompt + quality metrics summary cached → ~90% cost reduction
- **Estimated cost**: ~€0.30 per 1,000 queries with caching
- **Rate limit**: 20 queries/session to guard against runaway cost
- **Capabilities**: NL Q&A on quality scores, root cause suggestions, fix prioritisation, lineage impact explanation
- **Implementation**: streaming responses, multi-turn conversation in React state, tool calls to FastAPI endpoints

---

## Deployment plan (Phase 6)

| Service | Platform | Notes |
|---|---|---|
| FastAPI + React | Render or Railway | Free tier sufficient for demo |
| PostgreSQL | Render managed PG or Railway | Free tier |
| Neo4j | Neo4j Aura Free | 200K nodes, 400K relationships — enough |
| Claude API | Anthropic | Haiku 4.5, pay-as-you-go |

---

## Git

Repo: `MelissaRy/data-quality-platform` (private)
Remote: `https://github.com/MelissaRy/data-quality-platform.git`
Branch: `main`
Commits authored as Melissa Ryberg only — no Co-Authored-By.
