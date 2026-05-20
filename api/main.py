"""
Data Quality Platform API

Run from project root:
    python -m uvicorn api.main:app --reload --port 8001
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.db import lifespan
from api.routers import sources, runs, lineage, chat

app = FastAPI(
    title="Data Quality Platform API",
    version="1.0.0",
    lifespan=lifespan,
)

_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:8000,http://localhost:8001",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(sources.router, prefix="/api")
app.include_router(runs.router,    prefix="/api")
app.include_router(lineage.router, prefix="/api")
app.include_router(chat.router,    prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}


# Serve the React build in production (after `npm run build` in frontend/)
_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_dist):
    app.mount("/", StaticFiles(directory=_dist, html=True), name="static")
