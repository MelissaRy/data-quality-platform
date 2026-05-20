from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.db import get_neo4j

router = APIRouter()

WARN = 0.95
FAIL = 0.80


def _tag(score: float) -> str:
    if score >= WARN:
        return "OK"
    if score >= FAIL:
        return "WARN"
    return "FAIL"


class ImpactedAsset(BaseModel):
    name: str
    type: str


class CheckImpact(BaseModel):
    dimension: str
    field: str
    score: float
    tag: str
    impacted_assets: list[ImpactedAsset]


class SourceLineage(BaseModel):
    source: str
    failing_checks: list[CheckImpact]


class FailingCheck(BaseModel):
    source: str
    dimension: str
    field: str
    score: float
    tag: str
    issue_count: int
    total_count: int
    impacted_assets: list[str]


@router.get("/lineage/{source}", response_model=SourceLineage)
async def get_lineage(source: str, driver=Depends(get_neo4j)):
    async with driver.session() as session:
        result = await session.run(
            """
            MATCH (s:DataSource {name: $source})-[:HAS_CHECK]->(c:QualityCheck)-[:IMPACTS]->(a:DownstreamAsset)
            WHERE c.score < $threshold
            RETURN c.dimension AS dimension, c.field AS field, c.score AS score,
                   collect({name: a.name, type: a.type}) AS impacted_assets
            ORDER BY c.score ASC
            """,
            source=source,
            threshold=WARN,
        )
        records = await result.data()

    checks = [
        CheckImpact(
            dimension=r["dimension"],
            field=r["field"],
            score=round(r["score"], 4),
            tag=_tag(r["score"]),
            impacted_assets=[ImpactedAsset(**a) for a in r["impacted_assets"]],
        )
        for r in records
    ]
    return SourceLineage(source=source, failing_checks=checks)


@router.get("/lineage", response_model=list[FailingCheck])
async def get_failing(driver=Depends(get_neo4j)):
    """All failing checks across all sources with their downstream impact."""
    async with driver.session() as session:
        result = await session.run(
            """
            MATCH (s:DataSource)-[:HAS_CHECK]->(c:QualityCheck)
            WHERE c.score < $threshold
            OPTIONAL MATCH (c)-[:IMPACTS]->(a:DownstreamAsset)
            RETURN s.name AS source, c.dimension AS dimension, c.field AS field,
                   c.score AS score, c.issue_count AS issue_count, c.total_count AS total_count,
                   collect(a.name) AS impacted_assets
            ORDER BY c.score ASC
            """,
            threshold=WARN,
        )
        records = await result.data()

    return [
        FailingCheck(
            source=r["source"],
            dimension=r["dimension"],
            field=r["field"],
            score=round(r["score"], 4),
            tag=_tag(r["score"]),
            issue_count=r["issue_count"],
            total_count=r["total_count"],
            impacted_assets=[a for a in r["impacted_assets"] if a],
        )
        for r in records
    ]
