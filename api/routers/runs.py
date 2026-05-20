from collections import defaultdict

import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.db import get_pg

router = APIRouter()


class MetricResult(BaseModel):
    dimension: str
    field: str | None
    score: float
    issue_count: int
    total_count: int


class RunResult(BaseModel):
    run_id: int
    run_at: str
    status: str
    metrics: list[MetricResult]


@router.get("/runs/{source}", response_model=list[RunResult])
async def get_runs(source: str, pool: asyncpg.Pool = Depends(get_pg)):
    rows = await pool.fetch("""
        SELECT r.id AS run_id, r.run_at, r.status,
               m.dimension, m.field, m.score::float, m.issue_count, m.total_count
        FROM quality_runs r
        JOIN sources s     ON s.id = r.source_id
        JOIN quality_metrics m ON m.run_id = r.id
        WHERE s.name = $1
        ORDER BY r.run_at DESC, m.dimension, m.field
    """, source)

    by_run: dict[int, dict] = defaultdict(lambda: {"metrics": []})
    for row in rows:
        run = by_run[row["run_id"]]
        run["run_at"] = row["run_at"].isoformat()
        run["status"] = row["status"]
        run["metrics"].append(MetricResult(
            dimension=row["dimension"],
            field=row["field"],
            score=round(row["score"], 4),
            issue_count=row["issue_count"],
            total_count=row["total_count"],
        ))

    return [
        RunResult(run_id=run_id, **data)
        for run_id, data in by_run.items()
    ]
