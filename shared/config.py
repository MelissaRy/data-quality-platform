import os
import sys


def _require(key):
    val = os.environ.get(key)
    if not val:
        print(
            f"ERROR: {key} is not set. Copy .env.example to .env and fill in your values.",
            file=sys.stderr,
        )
    return val


# Postgres — full connection string including credentials; must be set via env
DB_URL = _require("DATABASE_URL")

# Neo4j — URI and username have safe non-credential defaults; password must be set
NEO4J_URI      = os.environ.get("NEO4J_URI",  "bolt://localhost:7687")
NEO4J_USER     = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = _require("NEO4J_PASSWORD")

SEED             = 42
NUM_EMPLOYEES    = 500
NUM_CUSTOMERS    = 800
NUM_TRANSACTIONS = 3000
NUM_DEALS        = 600
