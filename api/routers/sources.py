from collections import defaultdict

import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.db import get_pg

router = APIRouter()

WARN = 0.95
FAIL = 0.80


def _tag(score: float) -> str:
    if score >= WARN:
        return "OK"
    if score >= FAIL:
        return "WARN"
    return "FAIL"


class CheckResult(BaseModel):
    dimension: str
    field: str | None
    score: float
    issue_count: int
    total_count: int
    tag: str


class SourceSummary(BaseModel):
    name: str
    system_type: str
    description: str | None
    latest_run_at: str | None
    checks: list[CheckResult]


@router.get("/sources", response_model=list[SourceSummary])
async def list_sources(pool: asyncpg.Pool = Depends(get_pg)):
    rows = await pool.fetch("""
        SELECT DISTINCT ON (s.name, m.dimension, m.field)
            s.name, s.system_type, s.description,
            m.dimension, m.field, m.score::float, m.issue_count, m.total_count,
            r.run_at
        FROM quality_metrics m
        JOIN quality_runs r  ON r.id = m.run_id
        JOIN sources s       ON s.id = r.source_id
        WHERE r.status = 'complete'
        ORDER BY s.name, m.dimension, m.field, r.run_at DESC
    """)

    by_source: dict[str, dict] = defaultdict(lambda: {"checks": [], "latest_run_at": None})
    for row in rows:
        src = by_source[row["name"]]
        src["system_type"] = row["system_type"]
        src["description"] = row["description"]
        if src["latest_run_at"] is None or row["run_at"].isoformat() > src["latest_run_at"]:
            src["latest_run_at"] = row["run_at"].isoformat()
        score = row["score"]
        src["checks"].append(CheckResult(
            dimension=row["dimension"],
            field=row["field"],
            score=round(score, 4),
            issue_count=row["issue_count"],
            total_count=row["total_count"],
            tag=_tag(score),
        ))

    return [
        SourceSummary(name=name, **data)
        for name, data in sorted(by_source.items())
    ]


@router.get("/sources/{name}", response_model=SourceSummary)
async def get_source(name: str, pool: asyncpg.Pool = Depends(get_pg)):
    rows = await pool.fetch("""
        SELECT DISTINCT ON (m.dimension, m.field)
            s.name, s.system_type, s.description,
            m.dimension, m.field, m.score::float, m.issue_count, m.total_count,
            r.run_at
        FROM quality_metrics m
        JOIN quality_runs r  ON r.id = m.run_id
        JOIN sources s       ON s.id = r.source_id
        WHERE s.name = $1 AND r.status = 'complete'
        ORDER BY m.dimension, m.field, r.run_at DESC
    """, name)

    if not rows:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Source '{name}' not found")

    checks = [
        CheckResult(
            dimension=r["dimension"],
            field=r["field"],
            score=round(r["score"], 4),
            issue_count=r["issue_count"],
            total_count=r["total_count"],
            tag=_tag(r["score"]),
        )
        for r in rows
    ]
    first = rows[0]
    latest = max(r["run_at"].isoformat() for r in rows)
    return SourceSummary(
        name=first["name"],
        system_type=first["system_type"],
        description=first["description"],
        latest_run_at=latest,
        checks=checks,
    )
