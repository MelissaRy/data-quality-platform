"""
Sales/CRM data generator — simulates a CRM export with quality issues:
  - ~9% duplicate customer records (merged from two CRM systems)
  - ~6% deals with close_date before created_date (data migration error)
  - ~5% missing deal owner (reassignment gap)
  - ~7% invalid stage values (old picklist values not cleaned up)
  - ~4% revenue = 0 on Closed Won deals (quote not synced)
"""
import random
from datetime import date, timedelta

from faker import Faker

from shared.config import SEED, NUM_CUSTOMERS, NUM_DEALS

fake = Faker("en_GB")
random.seed(SEED + 2)
Faker.seed(SEED + 2)

VALID_STAGES = ["Prospecting", "Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"]
INVALID_STAGES = ["LEGACY_WIN", "old-prospect", "TBD", "???"]
REGIONS = ["EMEA", "APAC", "AMER", "UKI"]
INDUSTRIES = ["Financial Services", "Healthcare", "Retail", "Manufacturing", "Technology", "Public Sector"]


def _random_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def generate_customers(n: int = NUM_CUSTOMERS) -> list[dict]:
    customers = []
    for i in range(n):
        customers.append({
            "customer_id": f"CUS-{2000 + i}",
            "company_name": fake.company(),
            "contact_name": fake.name(),
            "email": fake.email(),
            "phone": fake.phone_number(),
            "region": random.choice(REGIONS),
            "industry": random.choice(INDUSTRIES),
            "created_date": _random_date(date(2020, 1, 1), date(2024, 12, 31)).isoformat(),
            "source": "CRM-Export",
        })

    # intentional issue: ~9% duplicates from CRM merger
    n_dupes = int(n * 0.09)
    dupes = random.sample(customers, n_dupes)
    for d in dupes:
        clone = d.copy()
        clone["customer_id"] = f"CUS-{9000 + random.randint(0, 999)}"
        customers.append(clone)

    random.shuffle(customers)
    return customers


def generate_deals(customers: list[dict], n: int = NUM_DEALS) -> list[dict]:
    today = date.today()
    customer_ids = [c["customer_id"] for c in customers]
    deals = []

    for i in range(n):
        created = _random_date(date(2023, 1, 1), today - timedelta(days=10))
        close_date = created + timedelta(days=random.randint(7, 180))

        # intentional issue: close before created
        if random.random() < 0.06:
            close_date = created - timedelta(days=random.randint(1, 30))

        stage = random.choice(VALID_STAGES)
        # intentional issue: invalid stage values
        if random.random() < 0.07:
            stage = random.choice(INVALID_STAGES)

        revenue = round(random.uniform(5000, 500000), 2)
        # intentional issue: Closed Won with zero revenue
        if stage == "Closed Won" and random.random() < 0.04:
            revenue = 0.0

        owner = fake.name()
        # intentional issue: missing deal owner
        if random.random() < 0.05:
            owner = None

        deals.append({
            "deal_id": f"DEAL-{5000 + i}",
            "customer_id": random.choice(customer_ids),
            "deal_name": f"{fake.bs().title()} Project",
            "stage": stage,
            "revenue": revenue,
            "currency": "EUR",
            "deal_owner": owner,
            "created_date": created.isoformat(),
            "close_date": close_date.isoformat(),
            "source": "CRM-Export",
        })

    return deals


if __name__ == "__main__":
    import json
    customers = generate_customers()
    deals = generate_deals(customers)
    print(json.dumps(customers[:2], indent=2))
    print(json.dumps(deals[:2], indent=2))
    print(f"Customers: {len(customers)}, Deals: {len(deals)}")
