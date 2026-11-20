import json
from typing import Annotated, Literal

import anthropic
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, StringConstraints

from api.db import get_pg
from api.ratelimit import chat_budget, chat_limiter, client_key

router = APIRouter()

_client = anthropic.AsyncAnthropic()
MODEL = "claude-haiku-4-5-20251001"
MAX_MESSAGES = 20
MAX_CONTENT_LEN = 4_000


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(max_length=MAX_CONTENT_LEN)]


class ChatRequest(BaseModel):
    messages: Annotated[list[Message], Field(min_length=1, max_length=MAX_MESSAGES)]


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

    try:
        async with _client.messages.stream(
            model=MODEL,
            max_tokens=512,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield f"data: {json.dumps({'content': text})}\n\n"
    except anthropic.AuthenticationError:
        yield f"data: {json.dumps({'content': 'AI assistant is not configured (missing API key).'})}\n\n"
    except anthropic.APIConnectionError:
        yield f"data: {json.dumps({'content': 'Could not reach the AI service. Please try again.'})}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/chat")
async def chat(
    req: ChatRequest,
    request: Request,
    pool: asyncpg.Pool = Depends(get_pg),
):
    # Per-client limit first: a single noisy caller should not consume the
    # shared daily budget before other visitors get a turn.
    allowed, retry_after = chat_limiter.check(client_key(request))
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests — please wait a moment before asking again.",
            headers={"Retry-After": str(retry_after)},
        )

    if not chat_budget.check():
        raise HTTPException(
            status_code=503,
            detail="The assistant has reached its daily demo budget. Please try again tomorrow.",
            headers={"Retry-After": "3600"},
        )

    context = await _quality_context(pool)
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    return StreamingResponse(
        _generate(messages, context),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )
