"""Orchestrates: generate → check → store results in PostgreSQL."""
import json
import os
import sys
from datetime import datetime, timezone

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared.config import DB_URL
from generators.hr import generate_employees
from generators.finance import generate_transactions
from generators.sales import generate_customers, generate_deals
from checks import hr_checks, finance_checks, sales_checks

SOURCES = [
    {"name": "HR",      "system_type": "HRIS", "description": "HRIS export — employees, managers, hire dates"},
    {"name": "Finance", "system_type": "ERP",  "description": "GL/ERP transaction export"},
    {"name": "Sales",   "system_type": "CRM",  "description": "CRM customer and deal export"},
]


def _upsert_sources(cur) -> dict[str, int]:
    source_ids = {}
    for s in SOURCES:
        cur.execute(
            """
            INSERT INTO sources (name, system_type, description)
            VALUES (%s, %s, %s)
            ON CONFLICT (name) DO UPDATE SET system_type = EXCLUDED.system_type
            RETURNING id
            """,
            (s["name"], s["system_type"], s["description"]),
        )
        source_ids[s["name"]] = cur.fetchone()[0]
    return source_ids


def _insert_run(cur, source_id: int) -> int:
    cur.execute(
        "INSERT INTO quality_runs (source_id, run_at, status) VALUES (%s, %s, %s) RETURNING id",
        (source_id, datetime.now(timezone.utc), "running"),
    )
    return cur.fetchone()[0]


def _insert_metrics(cur, run_id: int, metrics: list[dict]) -> None:
    for m in metrics:
        cur.execute(
            """
            INSERT INTO quality_metrics
                (run_id, dimension, field, score, issue_count, total_count, detail)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                run_id,
                m["dimension"],
                m.get("field"),
                m["score"],
                m["issue_count"],
                m["total_count"],
                json.dumps(m.get("detail", {})),
            ),
        )


def _complete_run(cur, run_id: int) -> None:
    cur.execute("UPDATE quality_runs SET status = 'complete' WHERE id = %s", (run_id,))


def _print_summary(source: str, metrics: list[dict]) -> None:
    print(f"\n  {source}")
    for m in metrics:
        if m["score"] >= 0.95:
            tag = "OK  "
        elif m["score"] >= 0.80:
            tag = "WARN"
        else:
            tag = "FAIL"
        field = m.get("field") or "(dataset)"
        print(f"    [{tag}] {m['dimension']:14} {field:20} score={m['score']:.4f}  issues={m['issue_count']}/{m['total_count']}")


def main():
    conn = psycopg2.connect(DB_URL)
    try:
        with conn.cursor() as cur:
            source_ids = _upsert_sources(cur)
        conn.commit()

        print("Generating data...")
        employees = generate_employees()
        transactions = generate_transactions()
        customers = generate_customers()
        deals = generate_deals(customers)
        print(f"  HR: {len(employees)} rows  Finance: {len(transactions)} rows  Customers: {len(customers)}  Deals: {len(deals)}")

        print("\nRunning quality checks...")
        runs = [
            ("HR",      hr_checks.run_all(employees)),
            ("Finance", finance_checks.run_all(transactions)),
            ("Sales",   sales_checks.run_all(customers, deals)),
        ]

        with conn.cursor() as cur:
            for source_name, metrics in runs:
                run_id = _insert_run(cur, source_ids[source_name])
                _insert_metrics(cur, run_id, metrics)
                _complete_run(cur, run_id)
                _print_summary(source_name, metrics)
        conn.commit()

        print("\nResults stored. Done.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
