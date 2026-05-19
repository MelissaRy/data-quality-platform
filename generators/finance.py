"""
Finance data generator — simulates a GL/ERP transaction export with quality issues:
  - ~6% null cost_centre (field not mapped in legacy ERP)
  - ~7% duplicate transaction IDs (reconciliation system bug)
  - ~5% negative amounts where type is 'Invoice' (sign convention mismatch)
  - ~4% amounts > 1M with type 'Expense' (likely data entry errors)
  - ~8% missing currency (default assumed but not recorded)
"""
import random
from datetime import date, timedelta

from faker import Faker

from shared.config import SEED, NUM_TRANSACTIONS

fake = Faker("en_GB")
random.seed(SEED + 1)
Faker.seed(SEED + 1)

TRANSACTION_TYPES = ["Invoice", "Expense", "Credit Note", "Payment", "Journal Entry"]
COST_CENTRES = ["CC-100", "CC-200", "CC-300", "CC-400", "CC-500", "CC-600"]
CURRENCIES = ["EUR", "GBP", "USD"]
VENDORS = [fake.company() for _ in range(60)]


def _random_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def generate_transactions(n: int = NUM_TRANSACTIONS) -> list[dict]:
    today = date.today()
    transactions = []

    for i in range(n):
        txn_id = f"TXN-{10000 + i}"
        txn_type = random.choice(TRANSACTION_TYPES)
        amount = round(random.uniform(50, 50000), 2)

        # intentional issue: negative invoices
        if txn_type == "Invoice" and random.random() < 0.05:
            amount = -abs(amount)

        # intentional issue: implausibly large expenses
        if txn_type == "Expense" and random.random() < 0.04:
            amount = round(random.uniform(1_000_001, 5_000_000), 2)

        cost_centre = random.choice(COST_CENTRES)
        # intentional issue: missing cost centre
        if random.random() < 0.06:
            cost_centre = None

        currency = random.choice(CURRENCIES)
        # intentional issue: missing currency
        if random.random() < 0.08:
            currency = None

        transactions.append({
            "transaction_id": txn_id,
            "transaction_type": txn_type,
            "amount": amount,
            "currency": currency,
            "cost_centre": cost_centre,
            "vendor": random.choice(VENDORS),
            "transaction_date": _random_date(date(2024, 1, 1), today).isoformat(),
            "approved_by": fake.name() if random.random() > 0.1 else None,
            "posted_date": (today - timedelta(days=random.randint(0, 5))).isoformat(),
            "source": "ERP-GL-Extract",
        })

    # intentional issue: ~7% duplicate transaction IDs
    n_dupes = int(n * 0.07)
    for _ in range(n_dupes):
        original = random.choice(transactions)
        clone = original.copy()
        clone["posted_date"] = (today - timedelta(days=random.randint(0, 2))).isoformat()
        transactions.append(clone)

    random.shuffle(transactions)
    return transactions


if __name__ == "__main__":
    import json
    rows = generate_transactions()
    print(json.dumps(rows[:3], indent=2))
    print(f"Total rows: {len(rows)}")
