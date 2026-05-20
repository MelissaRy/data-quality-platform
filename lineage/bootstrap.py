"""Clears and rebuilds the Neo4j lineage graph from the latest PG quality metrics."""
import os
import sys

import psycopg2
from neo4j import GraphDatabase

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared.config import DB_URL, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

SOURCES = [
    {"name": "HR",      "system_type": "HRIS"},
    {"name": "Finance", "system_type": "ERP"},
    {"name": "Sales",   "system_type": "CRM"},
]

DOWNSTREAM_ASSETS = [
    {"name": "Payroll Report",      "type": "report"},
    {"name": "Headcount Dashboard", "type": "dashboard"},
    {"name": "AP Ledger",           "type": "ledger"},
    {"name": "Board Finance Pack",  "type": "report"},
    {"name": "Sales Forecast",      "type": "forecast"},
    {"name": "Revenue Dashboard",   "type": "dashboard"},
]

FEEDS_INTO = {
    "HR":      ["Payroll Report", "Headcount Dashboard"],
    "Finance": ["AP Ledger", "Board Finance Pack"],
    "Sales":   ["Sales Forecast", "Revenue Dashboard"],
}

# (source_name, dimension, field) → downstream asset impacted
IMPACTS = [
    ("HR",      "completeness", "manager_id",     "Payroll Report"),
    ("HR",      "consistency",  "hire_date",      "Payroll Report"),
    ("HR",      "uniqueness",   "email",          "Headcount Dashboard"),
    ("HR",      "freshness",    "last_updated",   "Headcount Dashboard"),
    ("Finance", "completeness", "cost_centre",    "AP Ledger"),
    ("Finance", "completeness", "currency",       "AP Ledger"),
    ("Finance", "uniqueness",   "transaction_id", "AP Ledger"),
    ("Finance", "consistency",  "amount",         "Board Finance Pack"),
    ("Finance", "validity",     "amount",         "Board Finance Pack"),
    ("Sales",   "validity",     "stage",          "Sales Forecast"),
    ("Sales",   "consistency",  "close_date",     "Sales Forecast"),
    ("Sales",   "consistency",  "revenue",        "Sales Forecast"),
    ("Sales",   "freshness",    "created_date",   "Sales Forecast"),
    ("Sales",   "uniqueness",   "email",          "Revenue Dashboard"),
    ("Sales",   "completeness", "deal_owner",     "Revenue Dashboard"),
]


def _latest_metrics(pg_conn) -> list[dict]:
    """Most recent quality_metrics row per (source, dimension, field)."""
    with pg_conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (s.name, m.dimension, m.field)
                s.name        AS source_name,
                s.system_type,
                m.dimension,
                m.field,
                m.score,
                m.issue_count,
                m.total_count,
                r.run_at
            FROM quality_metrics m
            JOIN quality_runs r ON r.id = m.run_id
            JOIN sources s      ON s.id = r.source_id
            WHERE r.status = 'complete'
            ORDER BY s.name, m.dimension, m.field, r.run_at DESC
        """)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def build_graph(session, metrics: list[dict]) -> None:
    session.run(
        "MATCH (n) WHERE n:DataSource OR n:QualityCheck OR n:DownstreamAsset DETACH DELETE n"
    )

    for s in SOURCES:
        session.run(
            "CREATE (:DataSource {name: $name, system_type: $system_type})",
            **s,
        )

    for a in DOWNSTREAM_ASSETS:
        session.run(
            "CREATE (:DownstreamAsset {name: $name, type: $type})",
            **a,
        )

    for source_name, assets in FEEDS_INTO.items():
        for asset_name in assets:
            session.run(
                """
                MATCH (s:DataSource {name: $source}), (a:DownstreamAsset {name: $asset})
                CREATE (s)-[:FEEDS_INTO]->(a)
                """,
                source=source_name, asset=asset_name,
            )

    impact_index = {(src, dim, fld): asset for src, dim, fld, asset in IMPACTS}

    for m in metrics:
        field = m["field"] or ""
        session.run(
            """
            MATCH (s:DataSource {name: $source_name})
            CREATE (c:QualityCheck {
                source_name: $source_name,
                dimension:   $dimension,
                field:       $field,
                score:       $score,
                issue_count: $issue_count,
                total_count: $total_count,
                run_at:      $run_at
            })
            CREATE (s)-[:HAS_CHECK]->(c)
            """,
            source_name=m["source_name"],
            dimension=m["dimension"],
            field=field,
            score=float(m["score"]),
            issue_count=m["issue_count"],
            total_count=m["total_count"],
            run_at=m["run_at"].isoformat(),
        )

        asset_name = impact_index.get((m["source_name"], m["dimension"], field))
        if asset_name:
            session.run(
                """
                MATCH (c:QualityCheck {source_name: $source, dimension: $dim, field: $field})
                MATCH (a:DownstreamAsset {name: $asset})
                CREATE (c)-[:IMPACTS]->(a)
                """,
                source=m["source_name"],
                dim=m["dimension"],
                field=field,
                asset=asset_name,
            )

    print(
        f"Graph built: {len(SOURCES)} sources, {len(DOWNSTREAM_ASSETS)} assets, "
        f"{len(metrics)} quality checks."
    )


def main():
    pg_conn = psycopg2.connect(DB_URL)
    try:
        metrics = _latest_metrics(pg_conn)
    finally:
        pg_conn.close()

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    try:
        with driver.session() as session:
            build_graph(session, metrics)
    finally:
        driver.close()

    print("Done.")


if __name__ == "__main__":
    main()
