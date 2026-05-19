import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://dqp:__REDACTED__@localhost:5432/dqp")

SEED = 42
NUM_EMPLOYEES = 500
NUM_CUSTOMERS = 800
NUM_TRANSACTIONS = 3000
NUM_DEALS = 600
