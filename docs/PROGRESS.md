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
- [x] **Phase 3** — Neo4j lineage graph
- [x] **Phase 4** — FastAPI API
- [x] **Phase 5** — React dashboard + AI chat interface
- [x] **Phase 6** — Deployment (Render/Railway + Neo4j Aura free tier)

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

## Phase 3 detail — COMPLETE

Docker container: `dqp-neo4j` — bolt://localhost:7687, auth `neo4j/REDACTED`, browser at http://localhost:7474.

### Graph shape
- **3** DataSource nodes (HR/HRIS, Finance/ERP, Sales/CRM)
- **6** DownstreamAsset nodes (Payroll Report, Headcount Dashboard, AP Ledger, Board Finance Pack, Sales Forecast, Revenue Dashboard)
- **17** QualityCheck nodes (one per check result, properties: source_name, dimension, field, score, issue_count, total_count, run_at)
- **6** FEEDS_INTO · **17** HAS_CHECK · **15** IMPACTS relationships

### Files
```
lineage/__init__.py
lineage/bootstrap.py   — reads latest PG metrics, wipes + rebuilds Neo4j graph (idempotent)
lineage/queries.py     — blast_radius(source) and failing_checks() with CLI output
```

### How to run
```bash
python lineage/bootstrap.py   # rebuild graph from latest PG run
python lineage/queries.py     # print blast radius per source
```

---

## Phase 4 detail — COMPLETE

FastAPI API backed by asyncpg (Postgres) and async Neo4j driver.

**Run from project root:**
```bash
python -m uvicorn api.main:app --port 8001
# Note: port 8001 — port 8000 is taken by the Workplace Platform API
```

### Endpoints
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/api/sources` | All sources with latest check scores + tags |
| GET | `/api/sources/{name}` | Single source detail |
| GET | `/api/runs/{source}` | Full run history with all metrics per run |
| GET | `/api/lineage/{source}` | Blast radius: failing checks + impacted assets |
| GET | `/api/lineage` | All failing checks across sources with downstream impact |

### Files
```
api/__init__.py
api/main.py              — FastAPI app, CORS, lifespan, router registration
api/db.py                — asyncpg pool + async Neo4j driver, get_pg()/get_neo4j() deps
api/routers/sources.py   — /api/sources and /api/sources/{name}
api/routers/runs.py      — /api/runs/{source}
api/routers/lineage.py   — /api/lineage and /api/lineage/{source}
```

### Score tags
- `OK` — score ≥ 0.95
- `WARN` — score ≥ 0.80
- `FAIL` — score < 0.80

---

## Phase 5 — React dashboard + AI chat (NEXT)

### Goal
Dark-themed React SPA consuming the Phase 4 API. Three views: overview, source detail (with history chart), lineage explorer. Plus an AI chat panel powered by Claude Haiku 4.5.

### Pages / components
| Component | Data source | Library |
|---|---|---|
| Overview — source cards with overall health | `GET /api/sources` | Recharts RadialBar or simple score badge |
| Source detail — check breakdown + run history trend | `GET /api/sources/{name}` + `/api/runs/{name}` | Recharts LineChart |
| Lineage explorer — graph of failing checks → assets | `GET /api/lineage/{source}` | React Flow |
| AI chat panel — streaming, multi-turn | `POST /api/chat` (Phase 5 endpoint) | Anthropic SDK (server-side) |

### AI chat endpoint to add to API (`api/routers/chat.py`)
- `POST /api/chat` — accepts `{messages: [...], source?: str}`
- Server-side: builds context from latest `/api/sources` + `/api/lineage` data
- Calls Claude Haiku 4.5 with prompt caching (system prompt + metrics summary cached)
- Returns streaming SSE response
- Rate limit: 20 messages/session (tracked server-side in memory)

### AI cost strategy
- Model: `claude-haiku-4-5-20251001` — ~$1/1M input, $5/1M output
- Cache: system prompt + quality metrics JSON (~2K tokens) → cache_control: ephemeral
- Estimated: ~€0.30 per 1,000 queries with caching
- Rate limit: 20 queries/session guards against runaway cost

### Tech choices
- Vite + React 18 (no Next.js — simpler for a portfolio SPA)
- Tailwind CSS for dark theme
- Recharts for score/trend charts
- React Flow for lineage graph
- Tanstack Query for data fetching + caching

### File structure to create
```
frontend/
  index.html
  vite.config.js
  src/
    main.jsx
    App.jsx
    pages/
      Overview.jsx
      SourceDetail.jsx
      Lineage.jsx
    components/
      SourceCard.jsx
      CheckTable.jsx
      TrendChart.jsx
      LineageGraph.jsx
      ChatPanel.jsx
    api/
      client.js         — fetch wrappers for all API endpoints
```

---

## Phase 5 detail — COMPLETE

### Stack
- Vite **5.4.x** + React 18 + Tailwind **3** + Recharts **2** + React Flow 11
- **Important**: Vite 8 requires Node ≥20.19; system has 20.18.2 — locked to Vite 5.

### Run locally
```bash
cd frontend && npm run dev          # Vite dev server on :5173, proxies /api → :8001
# or for prod preview:
npm run build                       # outputs to frontend/dist/ (served by FastAPI)
```

### Pages
| Page | Route state | Data |
|---|---|---|
| Overview | `overview` | `GET /api/sources` — source cards + top issues table |
| Source detail | `source:HR` etc. | `GET /api/sources/{name}` + `/api/runs/{name}` |
| Lineage | `lineage` | `GET /api/lineage/{source}` — React Flow blast-radius graph |

### AI chat (`POST /api/chat`)
- Claude Haiku 4.5 with system prompt + quality metrics cached (`cache_control: ephemeral`)
- Streaming SSE — ChatPanel reads chunks via `ReadableStream`
- Rate limit: 20 messages/session (checked server-side)
- Requires `ANTHROPIC_API_KEY` environment variable

### Components
`Tag` · `SourceCard` · `CheckTable` (score bar + tag) · `TrendChart` (Recharts LineChart) · `LineageGraph` (React Flow, animated edges for FAIL checks) · `ChatPanel` (streaming, bounce dots while loading)

---

## Phase 6 — Deployment (NEXT)

### Plan
| Service | Platform | Notes |
|---|---|---|
| FastAPI + React | Render web service | `npm run build` then FastAPI serves `frontend/dist/` via StaticFiles |
| PostgreSQL | Render managed PG | Free tier |
| Neo4j | Neo4j Aura Free | 200K nodes / 400K rels — sufficient |
| Claude API | Anthropic | Haiku 4.5, pay-as-you-go |

### Env vars needed on Render
```
DATABASE_URL          postgresql://...   (Render provides this)
NEO4J_URI             neo4j+s://...      (Aura connection string)
NEO4J_USER            neo4j
NEO4J_PASSWORD        ...
ANTHROPIC_API_KEY     sk-ant-...
```

### Files (committed)
```
Dockerfile        — python:3.12-slim + Node 20 + frontend build + app code
start.sh          — bootstraps PG → runs checks → builds lineage (|| warn) → starts uvicorn
render.yaml       — Render infra-as-code: Docker web service + free PG database
.dockerignore     — excludes node_modules, dist, .git
.python-version   — 3.12
requirements.txt  — pinned to versions verified locally
```

### How to deploy
1. **Neo4j Aura Free** — create instance at [console.neo4j.io](https://console.neo4j.io). Copy connection URI (`neo4j+s://...`) and password.
2. **Render** — connect the GitHub repo. Render picks up `render.yaml` automatically.
3. **Set env vars** in Render dashboard:
   - `NEO4J_URI` = `neo4j+s://<id>.databases.neo4j.io`
   - `NEO4J_PASSWORD` = (from Aura console)
   - `ANTHROPIC_API_KEY` = (from console.anthropic.com)
   - `NEO4J_USER` is already set to `neo4j` in render.yaml
4. **Deploy** — Render builds the Docker image, `start.sh` handles all first-run setup automatically.

### Startup sequence (automatic on every deploy)
```
python db/bootstrap.py     # idempotent — CREATE TABLE IF NOT EXISTS
python checks/runner.py    # generates data + runs all quality checks
python lineage/bootstrap.py # clears + rebuilds Neo4j graph (skipped if unavailable)
uvicorn api.main:app        # starts the API
```

### Test locally with Docker
```bash
docker build -t dqp-app .
docker run --rm --network host \
  -e DATABASE_URL="postgresql://dqp:__REDACTED__@localhost:5432/dqp" \
  -e NEO4J_URI="bolt://localhost:7687" \
  -e NEO4J_USER="neo4j" \
  -e NEO4J_PASSWORD="__REDACTED__" \
  -e PORT=8002 \
  dqp-app
```

---

## Git

Repo: `MelissaRy/data-quality-platform` (private)
Remote: `https://github.com/MelissaRy/data-quality-platform.git`
Branch: `main`
Commits authored as Melissa Ryberg only — no Co-Authored-By.
