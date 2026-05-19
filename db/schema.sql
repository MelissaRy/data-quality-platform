CREATE TABLE IF NOT EXISTS sources (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    system_type TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS quality_runs (
    id        SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES sources(id),
    run_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status    TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS quality_metrics (
    id          SERIAL PRIMARY KEY,
    run_id      INTEGER NOT NULL REFERENCES quality_runs(id),
    dimension   TEXT NOT NULL,
    field       TEXT,
    score       NUMERIC(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
    issue_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    detail      JSONB
);
