"""Connect to PostgreSQL and apply schema.sql."""
import os
import sys

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from shared.config import DB_URL


def bootstrap():
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path) as f:
        sql = f.read()

    conn = psycopg2.connect(DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print("Schema bootstrapped.")
    finally:
        conn.close()


if __name__ == "__main__":
    bootstrap()
