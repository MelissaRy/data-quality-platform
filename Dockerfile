# ── Stage 1: build the frontend ───────────────────────────────────────────────
# Node lives only in this stage; it never reaches the runtime image, which keeps
# the shipped surface to the Python runtime and its dependencies.
FROM node:20-slim AS frontend

WORKDIR /build

# Separate layer so npm ci is only re-run when the lockfile actually changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Fail fast and log straight through — no buffered output on crash.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code, then the built frontend from stage 1.
COPY . .
COPY --from=frontend /build/dist ./frontend/dist

RUN chmod +x start.sh

# Run as an unprivileged user. Created after the copies so the image layers stay
# root-owned and read-only to the runtime user — the app has no reason to
# rewrite its own code, and a container escape has no writable foothold.
RUN useradd --create-home --uid 10001 appuser
USER 10001

EXPOSE 8000

CMD ["./start.sh"]
