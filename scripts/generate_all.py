"""Run all generators and print a summary of records produced."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from generators.hr import generate_employees
from generators.finance import generate_transactions
from generators.sales import generate_customers, generate_deals


def main():
    print("Generating HR data...")
    employees = generate_employees()
    print(f"  {len(employees)} employee rows (including duplicates)")

    print("Generating Finance data...")
    transactions = generate_transactions()
    print(f"  {len(transactions)} transaction rows (including duplicates)")

    print("Generating Sales data...")
    customers = generate_customers()
    deals = generate_deals(customers)
    print(f"  {len(customers)} customer rows (including duplicates)")
    print(f"  {len(deals)} deal rows")

    print("\nDone. All generators healthy.")


if __name__ == "__main__":
    main()
