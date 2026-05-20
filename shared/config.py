import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://dqp:__REDACTED__@localhost:5432/dqp")

NEO4J_URI      = os.environ.get("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER     = os.environ.get("NEO4J_USER",     "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "REDACTED")

SEED = 42
NUM_EMPLOYEES = 500
NUM_CUSTOMERS = 800
NUM_TRANSACTIONS = 3000
NUM_DEALS = 600
