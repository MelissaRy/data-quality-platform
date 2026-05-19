"""
HR data generator — simulates an HRIS export with intentional quality issues:
  - ~8% missing manager IDs (new hires not yet assigned)
  - ~5% duplicate employee records (system migration artefact)
  - ~10% stale last_updated (batch job that ran late)
  - ~3% invalid email format (manual entry errors)
  - ~4% future hire dates (data entry mistakes)
"""
import random
import uuid
from datetime import date, timedelta

from faker import Faker

from shared.config import SEED, NUM_EMPLOYEES

fake = Faker("en_GB")
random.seed(SEED)
Faker.seed(SEED)

DEPARTMENTS = [
    "Engineering", "Finance", "Sales", "HR", "Marketing",
    "Legal", "Operations", "IT", "Product", "Customer Success",
]
EMPLOYMENT_TYPES = ["Full-Time", "Part-Time", "Contractor", "Intern"]
STATUSES = ["Active", "Active", "Active", "Active", "Active", "Active", "On Leave", "Terminated"]


def _random_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def generate_employees(n: int = NUM_EMPLOYEES) -> list[dict]:
    today = date.today()
    employees = []

    for i in range(n):
        emp_id = f"EMP-{1000 + i}"
        hire_date = _random_date(date(2015, 1, 1), today)

        # intentional issue: ~4% future hire dates
        if random.random() < 0.04:
            hire_date = today + timedelta(days=random.randint(1, 90))

        last_updated = today - timedelta(days=random.randint(0, 2))
        # intentional issue: ~10% stale records
        if random.random() < 0.10:
            last_updated = today - timedelta(days=random.randint(30, 180))

        email = fake.email()
        # intentional issue: ~3% invalid email format
        if random.random() < 0.03:
            email = email.replace("@", "").replace(".", "")

        manager_id = f"EMP-{random.randint(1000, 1000 + n - 1)}" if i > 0 else None
        # intentional issue: ~8% missing manager
        if random.random() < 0.08:
            manager_id = None

        employees.append({
            "employee_id": emp_id,
            "full_name": fake.name(),
            "email": email,
            "department": random.choice(DEPARTMENTS),
            "employment_type": random.choice(EMPLOYMENT_TYPES),
            "status": random.choice(STATUSES),
            "hire_date": hire_date.isoformat(),
            "manager_id": manager_id,
            "salary": round(random.uniform(28000, 140000), 2),
            "last_updated": last_updated.isoformat(),
            "source": "HRIS-Export-v2",
        })

    # intentional issue: ~5% duplicates (same person, new UUID row)
    n_dupes = int(n * 0.05)
    dupes = random.sample(employees, n_dupes)
    for d in dupes:
        clone = d.copy()
        clone["employee_id"] = f"EMP-{9000 + random.randint(0, 999)}"
        employees.append(clone)

    random.shuffle(employees)
    return employees


if __name__ == "__main__":
    import json
    rows = generate_employees()
    print(json.dumps(rows[:3], indent=2))
    print(f"Total rows: {len(rows)}")
