"""
Data Quality Platform API

Run from project root:
    uvicorn api.main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.db import lifespan
from api.routers import sources, runs, lineage

app = FastAPI(
    title="Data Quality Platform API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sources.router, prefix="/api")
app.include_router(runs.router,    prefix="/api")
app.include_router(lineage.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
