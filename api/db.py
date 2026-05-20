from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI
from neo4j import AsyncGraphDatabase

from shared.config import DB_URL, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

_pg_pool: asyncpg.Pool | None = None
_neo4j_driver = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pg_pool, _neo4j_driver
    _pg_pool = await asyncpg.create_pool(DB_URL)
    _neo4j_driver = AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    yield
    await _pg_pool.close()
    await _neo4j_driver.close()


async def get_pg() -> asyncpg.Pool:
    return _pg_pool


async def get_neo4j():
    return _neo4j_driver
