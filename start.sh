#!/bin/sh
set -e

echo "==> Bootstrapping database schema..."
python db/bootstrap.py

echo "==> Running quality checks..."
python checks/runner.py

echo "==> Building Neo4j lineage graph..."
python lineage/bootstrap.py || echo "Warning: Neo4j unavailable — lineage graph skipped. Set NEO4J_URI to enable."

echo "==> Starting API..."
exec python -m uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-8000}"
