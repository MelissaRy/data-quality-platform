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
- [x] **Phase 2** — PostgreSQL metrics store + quality check pipeline
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

## Phase 2 detail — COMPLETE

### PostgreSQL schema (`db/schema.sql`)
```
sources          — id, name, system_type, description
quality_runs     — id, source_id, run_at, status
quality_metrics  — id, run_id, dimension, field, score (0–1), issue_count, total_count, detail (JSONB)
```

### Files
```
db/schema.sql            — CREATE TABLE statements
db/bootstrap.py          — connects to PG and runs schema.sql
checks/__init__.py
checks/hr_checks.py      — 5 checks: freshness, completeness (manager_id), uniqueness (email), consistency (hire_date), validity (email)
checks/finance_checks.py — 6 checks: freshness, completeness (cost_centre, currency), uniqueness (transaction_id), consistency (Invoice amounts), validity (Expense amounts)
checks/sales_checks.py   — 6 checks: freshness (deal created_date), completeness (deal_owner), uniqueness (customer email), consistency (close_date, Closed Won revenue), validity (stage)
checks/runner.py         — generates data, runs all checks, stores results, prints scored summary
```

### How to run
```bash
# Start PostgreSQL (Docker — only needed once)
docker run -d --name dqp-pg -e POSTGRES_USER=dqp -e POSTGRES_PASSWORD=__REDACTED__ \
  -e POSTGRES_DB=dqp -p 5432:5432 postgres:16

# Bootstrap schema (idempotent — safe to re-run)
python db/bootstrap.py

# Run quality checks and store results
python checks/runner.py
```

### Check result format
Each check returns:
```python
{"dimension": str, "field": str|None, "score": float, "issue_count": int, "total_count": int, "detail": dict}
```
Score thresholds: ≥0.95 = OK, ≥0.80 = WARN, <0.80 = FAIL

### Key implementation note
HR and Sales generators give clones **new** IDs (EMP-9xxx, CUS-9xxx), so uniqueness is checked on `email` not the ID field. Finance duplicates reuse the same `transaction_id`, so ID-based uniqueness works there.

### Observed scores (deterministic, seed=42)
| Source | Dimension | Field | Score | Tag |
|---|---|---|---|---|
| HR | freshness | last_updated | 0.8724 | WARN |
| HR | completeness | manager_id | 0.9276 | WARN |
| HR | uniqueness | email | 0.9524 | OK |
| HR | consistency | hire_date | 0.9543 | OK |
| HR | validity | email | 0.9752 | OK |
| Finance | freshness | posted_date | 1.0000 | OK |
| Finance | completeness | cost_centre | 0.9380 | WARN |
| Finance | completeness | currency | 0.9206 | WARN |
| Finance | uniqueness | transaction_id | 0.9346 | WARN |
| Finance | consistency | amount | 0.9492 | WARN |
| Finance | validity | amount | 0.9641 | OK |
| Sales | freshness | created_date | 0.2750 | **FAIL** |
| Sales | completeness | deal_owner | 0.9533 | OK |
| Sales | uniqueness | email | 0.9163 | WARN |
| Sales | consistency | close_date | 0.9450 | WARN |
| Sales | consistency | revenue | 0.9451 | WARN |
| Sales | validity | stage | 0.9367 | WARN |

Sales freshness FAIL is expected — deals go back to 2023 and the freshness window is 365 days; this is a deliberate quality story for the demo.

---

## Phase 3 — Neo4j lineage graph (NEXT)

### Goal
Model how data flows between sources and downstream assets, and show which quality failures have downstream impact.

### Nodes
| Label | Properties | Description |
|---|---|---|
| DataSource | name, system_type | HR, Finance, Sales |
| Field | name, source_name | A column within a source |
| QualityCheck | dimension, field, score, issue_count, run_at | Latest check result per dimension+field |
| DownstreamAsset | name, type | e.g. "Payroll Report", "Board Dashboard", "Sales Forecast" |

### Relationships
| Relationship | From → To | Meaning |
|---|---|---|
| FEEDS_INTO | DataSource → DownstreamAsset | Source data is consumed by this asset |
| HAS_CHECK | DataSource → QualityCheck | This source has this quality check |
| IMPACTS | QualityCheck → DownstreamAsset | A failing check impacts this downstream asset |

### Downstream assets to mock
| Asset | Feeds from | Critical checks |
|---|---|---|
| Payroll Report | HR | completeness (manager_id), consistency (hire_date) |
| Headcount Dashboard | HR | uniqueness (email), freshness (last_updated) |
| AP Ledger | Finance | completeness (cost_centre, currency), uniqueness (transaction_id) |
| Board Finance Pack | Finance | consistency (amount), validity (amount) |
| Sales Forecast | Sales | validity (stage), consistency (close_date, revenue) |
| Revenue Dashboard | Sales | uniqueness (email), completeness (deal_owner) |

### Files to create
```
lineage/bootstrap.py     — clears and rebuilds Neo4j graph from latest quality_metrics in PG
lineage/queries.py       — Cypher helpers: get_blast_radius(source), get_failing_checks()
```

### How to run
```bash
# Neo4j must be running — use the existing local instance on bolt://localhost:7687
# (same one used by the Workplace Platform, or spin up a fresh Docker container)

# Build the graph from latest PG results
python lineage/bootstrap.py

# Test blast-radius query
python lineage/queries.py
```

### Cypher patterns to implement
```cypher
-- Blast radius: which assets are impacted by failing checks on a source?
MATCH (s:DataSource {name: $source})-[:HAS_CHECK]->(c:QualityCheck)-[:IMPACTS]->(a:DownstreamAsset)
WHERE c.score < 0.95
RETURN c.dimension, c.field, c.score, collect(a.name) AS impacted_assets
ORDER BY c.score ASC

-- All failing checks across all sources
MATCH (s:DataSource)-[:HAS_CHECK]->(c:QualityCheck)
WHERE c.score < 0.95
RETURN s.name, c.dimension, c.field, c.score
ORDER BY c.score ASC
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
