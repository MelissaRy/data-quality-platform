from datetime import date

STALE_THRESHOLD_DAYS = 5
VALID_CURRENCIES = {"EUR", "GBP", "USD"}
MAX_EXPENSE = 1_000_000


def check_freshness(rows: list[dict]) -> dict:
    today = date.today()
    total = len(rows)
    issues = sum(
        1 for r in rows
        if (today - date.fromisoformat(r["posted_date"])).days > STALE_THRESHOLD_DAYS
    )
    return {
        "dimension": "freshness",
        "field": "posted_date",
        "score": round(1 - issues / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {"stale_threshold_days": STALE_THRESHOLD_DAYS},
    }


def check_completeness_cost_centre(rows: list[dict]) -> dict:
    total = len(rows)
    issues = sum(1 for r in rows if r.get("cost_centre") is None)
    return {
        "dimension": "completeness",
        "field": "cost_centre",
        "score": round(1 - issues / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {},
    }


def check_completeness_currency(rows: list[dict]) -> dict:
    total = len(rows)
    issues = sum(1 for r in rows if r.get("currency") is None)
    return {
        "dimension": "completeness",
        "field": "currency",
        "score": round(1 - issues / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {},
    }


def check_uniqueness(rows: list[dict]) -> dict:
    total = len(rows)
    unique = len({r["transaction_id"] for r in rows})
    issues = total - unique
    return {
        "dimension": "uniqueness",
        "field": "transaction_id",
        "score": round(unique / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {},
    }


def check_consistency_invoice_amounts(rows: list[dict]) -> dict:
    invoices = [r for r in rows if r["transaction_type"] == "Invoice"]
    total = len(invoices)
    issues = sum(1 for r in invoices if r["amount"] < 0)
    return {
        "dimension": "consistency",
        "field": "amount",
        "score": round(1 - issues / total, 4) if total > 0 else 1.0,
        "issue_count": issues,
        "total_count": total,
        "detail": {"rule": "Invoice amount must be positive", "filtered_type": "Invoice"},
    }


def check_validity_expense_amount(rows: list[dict]) -> dict:
    expenses = [r for r in rows if r["transaction_type"] == "Expense"]
    total = len(expenses)
    issues = sum(1 for r in expenses if r["amount"] > MAX_EXPENSE)
    return {
        "dimension": "validity",
        "field": "amount",
        "score": round(1 - issues / total, 4) if total > 0 else 1.0,
        "issue_count": issues,
        "total_count": total,
        "detail": {"rule": f"Expense amount must be <= {MAX_EXPENSE}", "filtered_type": "Expense"},
    }


def run_all(rows: list[dict]) -> list[dict]:
    return [
        check_freshness(rows),
        check_completeness_cost_centre(rows),
        check_completeness_currency(rows),
        check_uniqueness(rows),
        check_consistency_invoice_amounts(rows),
        check_validity_expense_amount(rows),
    ]
