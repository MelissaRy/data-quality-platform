from datetime import date, timedelta

VALID_STAGES = {"Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"}
FRESHNESS_WINDOW_DAYS = 365


def check_freshness(customers: list[dict], deals: list[dict]) -> dict:
    cutoff = date.today() - timedelta(days=FRESHNESS_WINDOW_DAYS)
    total = len(deals)
    issues = sum(1 for d in deals if date.fromisoformat(d["created_date"]) < cutoff)
    return {
        "dimension": "freshness",
        "field": "created_date",
        "score": round(1 - issues / total, 4) if total > 0 else 1.0,
        "issue_count": issues,
        "total_count": total,
        "detail": {"freshness_window_days": FRESHNESS_WINDOW_DAYS, "entity": "deals"},
    }


def check_completeness_deal_owner(deals: list[dict]) -> dict:
    total = len(deals)
    issues = sum(1 for d in deals if d.get("deal_owner") is None)
    return {
        "dimension": "completeness",
        "field": "deal_owner",
        "score": round(1 - issues / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {"entity": "deals"},
    }


def check_uniqueness_customers(customers: list[dict]) -> dict:
    # Clones get new customer_ids (CUS-9xxx), so detect duplicates via email
    total = len(customers)
    unique = len({c["email"] for c in customers})
    issues = total - unique
    return {
        "dimension": "uniqueness",
        "field": "email",
        "score": round(unique / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {"note": "same email = same company contact merged from two CRM systems", "entity": "customers"},
    }


def check_consistency_close_date(deals: list[dict]) -> dict:
    total = len(deals)
    issues = sum(
        1 for d in deals
        if date.fromisoformat(d["close_date"]) < date.fromisoformat(d["created_date"])
    )
    return {
        "dimension": "consistency",
        "field": "close_date",
        "score": round(1 - issues / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {"rule": "close_date must be >= created_date", "entity": "deals"},
    }


def check_consistency_closed_won_revenue(deals: list[dict]) -> dict:
    won = [d for d in deals if d["stage"] == "Closed Won"]
    total = len(won)
    issues = sum(1 for d in won if d["revenue"] == 0)
    return {
        "dimension": "consistency",
        "field": "revenue",
        "score": round(1 - issues / total, 4) if total > 0 else 1.0,
        "issue_count": issues,
        "total_count": total,
        "detail": {"rule": "Closed Won deals must have revenue > 0", "entity": "deals"},
    }


def check_validity_stage(deals: list[dict]) -> dict:
    total = len(deals)
    issues = sum(1 for d in deals if d["stage"] not in VALID_STAGES)
    return {
        "dimension": "validity",
        "field": "stage",
        "score": round(1 - issues / total, 4),
        "issue_count": issues,
        "total_count": total,
        "detail": {"valid_values": sorted(VALID_STAGES), "entity": "deals"},
    }


def run_all(customers: list[dict], deals: list[dict]) -> list[dict]:
    return [
        check_freshness(customers, deals),
        check_completeness_deal_owner(deals),
        check_uniqueness_customers(customers),
        check_consistency_close_date(deals),
        check_consistency_closed_won_revenue(deals),
        check_validity_stage(deals),
    ]
