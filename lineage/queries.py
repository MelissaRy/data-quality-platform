"""Cypher query helpers — blast radius and failing checks."""
import os
import sys

from neo4j import GraphDatabase

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared.config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

WARN_THRESHOLD = 0.95
FAIL_THRESHOLD = 0.80


def blast_radius(source: str, driver) -> list[dict]:
    """Failing checks on a source and the downstream assets they impact."""
    with driver.session() as session:
        result = session.run(
            """
            MATCH (s:DataSource {name: $source})-[:HAS_CHECK]->(c:QualityCheck)-[:IMPACTS]->(a:DownstreamAsset)
            WHERE c.score < $threshold
            RETURN c.dimension AS dimension, c.field AS field, c.score AS score,
                   collect(a.name) AS impacted_assets
            ORDER BY c.score ASC
            """,
            source=source,
            threshold=WARN_THRESHOLD,
        )
        return [dict(r) for r in result]


def failing_checks(driver) -> list[dict]:
    """All checks below the warn threshold, across all sources."""
    with driver.session() as session:
        result = session.run(
            """
            MATCH (s:DataSource)-[:HAS_CHECK]->(c:QualityCheck)
            WHERE c.score < $threshold
            RETURN s.name AS source, c.dimension AS dimension, c.field AS field,
                   c.score AS score, c.issue_count AS issue_count, c.total_count AS total_count
            ORDER BY c.score ASC
            """,
            threshold=WARN_THRESHOLD,
        )
        return [dict(r) for r in result]


def _tag(score: float) -> str:
    return "FAIL" if score < FAIL_THRESHOLD else "WARN"


def main():
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    try:
        print("All failing checks:")
        for r in failing_checks(driver):
            print(
                f"  [{_tag(r['score'])}] {r['source']:8} {r['dimension']:14} "
                f"{r['field']:20} score={r['score']:.4f}  issues={r['issue_count']}/{r['total_count']}"
            )

        print("\nBlast radius per source:")
        for source in ["HR", "Finance", "Sales"]:
            rows = blast_radius(source, driver)
            if not rows:
                print(f"  {source}: no failing checks with downstream impact")
                continue
            print(f"  {source}:")
            for r in rows:
                assets = ", ".join(r["impacted_assets"])
                print(
                    f"    [{_tag(r['score'])}] {r['dimension']:14} {r['field']:20} "
                    f"score={r['score']:.4f} → {assets}"
                )
    finally:
        driver.close()


if __name__ == "__main__":
    main()
