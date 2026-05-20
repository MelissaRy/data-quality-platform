import json

import anthropic
import asyncpg
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.db import get_pg

router = APIRouter()

_client = anthropic.AsyncAnthropic()
MODEL = "claude-haiku-4-5-20251001"
MAX_MESSAGES = 20


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]


async def _quality_context(pool: asyncpg.Pool) -> str:
    rows = await pool.fetch("""
        SELECT DISTINCT ON (s.name, m.dimension, m.field)
            s.name AS source, m.dimension, m.field,
            m.score::float, m.issue_count, m.total_count
        FROM quality_metrics m
        JOIN quality_runs r ON r.id = m.run_id
        JOIN sources s      ON s.id = r.source_id
        WHERE r.status = 'complete'
        ORDER BY s.name, m.dimension, m.field, r.run_at DESC
    """)
    lines = []
    for r in rows:
        tag = "OK" if r["score"] >= 0.95 else ("WARN" if r["score"] >= 0.80 else "FAIL")
        lines.append(
            f"  {r['source']:8} {r['dimension']:14} {r['field']:20} "
            f"score={r['score']:.4f} [{tag}]  issues={r['issue_count']}/{r['total_count']}"
        )
    return "\n".join(lines)


async def _generate(messages: list[dict], context: str):
    system = [
        {
            "type": "text",
            "text": (
                "You are a data quality analyst assistant for an enterprise data platform.\n"
                "You help users understand quality issues across HR (HRIS), Finance (ERP), "
                "and Sales (CRM) data.\n\n"
                "Current quality metrics (score: ≥0.95=OK, ≥0.80=WARN, <0.80=FAIL):\n"
                f"{context}\n\n"
                "Be concise — under 150 words unless the user asks for more detail. "
                "Cite specific scores and issue counts. Suggest actionable fixes."
            ),
            "cache_control": {"type": "ephemeral"},
        }
    ]

    async with _client.messages.stream(
        model=MODEL,
        max_tokens=512,
        system=system,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield f"data: {json.dumps({'content': text})}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/chat")
async def chat(req: ChatRequest, pool: asyncpg.Pool = Depends(get_pg)):
    if len(req.messages) > MAX_MESSAGES:
        return {"error": "Session message limit reached (20)"}

    context = await _quality_context(pool)
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    return StreamingResponse(
        _generate(messages, context),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )
