# Data Quality Observability Platform

A portfolio project demonstrating end-to-end data quality monitoring across mock enterprise data sources.

## Stack

| Layer | Technology |
|---|---|
| Mock data sources | Python generators (HR, Finance, Sales) |
| Metrics store | PostgreSQL |
| Lineage graph | Neo4j |
| API | FastAPI |
| Dashboard | React + Recharts + React Flow |
| AI interface | Claude API (Haiku) |

## Data sources

Three simulated enterprise systems with intentional quality issues:

- **HR** (HRIS export) — 500 employees + ~5% duplicates, missing managers, invalid emails, stale records
- **Finance** (ERP/GL export) — 3,000 transactions + ~7% duplicates, missing cost centres, sign errors
- **Sales** (CRM export) — 800 customers + ~9% duplicates, invalid pipeline stages, date inconsistencies

## Phases

- [x] Phase 1 — Mock data generators
- [ ] Phase 2 — PostgreSQL metrics store + quality checks
- [ ] Phase 3 — Neo4j lineage graph
- [ ] Phase 4 — FastAPI API
- [ ] Phase 5 — React dashboard + AI chat interface
- [ ] Phase 6 — Deployment (Render / Railway + Neo4j Aura)

## Local setup

```bash
pip install -r requirements.txt
python scripts/generate_all.py
```
