import re
from datetime import date, timedelta

STALE_THRESHOLD_DAYS = 7
_EMAIL_RE = re.compile(r"[^@]+@[^@]+\.[^@]+")


def check_freshness(rows: list[dict]) -> dict:
    today = date.today()
    total = len(rows)
    issues = sum(
        1 for r in rows
        if (today - date.fromisoformat(r["last_updated"])).days > STALE_THRESHOLD_DAYS
    )
    return {
        "dimension": "freshness",
        "field": "last_updated",
        "score": round(1 - issues / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {"stale_threshold_days": STALE_THRESHOLD_DAYS},
    }


def check_completeness_manager(rows: list[dict]) -> dict:
    total = len(rows)
    issues = sum(1 for r in rows if r.get("manager_id") is None)
    return {
        "dimension": "completeness",
        "field": "manager_id",
        "score": round(1 - issues / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {},
    }


def check_uniqueness(rows: list[dict]) -> dict:
    # Clones get new employee_ids (EMP-9xxx), so detect duplicates via email
    total = len(rows)
    unique = len({r["email"] for r in rows})
    issues = total - unique
    return {
        "dimension": "uniqueness",
        "field": "email",
        "score": round(unique / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {"note": "same email = same person with a second record"},
    }


def check_consistency_hire_date(rows: list[dict]) -> dict:
    today = date.today()
    total = len(rows)
    issues = sum(1 for r in rows if date.fromisoformat(r["hire_date"]) > today)
    return {
        "dimension": "consistency",
        "field": "hire_date",
        "score": round(1 - issues / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {"rule": "hire_date must not be in the future"},
    }


def check_validity_email(rows: list[dict]) -> dict:
    total = len(rows)
    issues = sum(1 for r in rows if not _EMAIL_RE.match(r.get("email", "")))
    return {
        "dimension": "validity",
        "field": "email",
        "score": round(1 - issues / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {"rule": "email must match standard format"},
    }


def run_all(rows: list[dict]) -> list[dict]:
    return [
        check_freshness(rows),
        check_completeness_manager(rows),
        check_uniqueness(rows),
        check_consistency_hire_date(rows),
        check_validity_email(rows),
    ]
