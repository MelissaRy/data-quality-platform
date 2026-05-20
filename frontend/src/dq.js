// Data layer — fetches from the real API and overlays live scores onto the rich
// mock dataset. Falls back gracefully to full mock when API is unavailable.

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const TAG_TO_STATUS = { FAIL: 'att', WARN: 'watch', OK: 'good' };

export const scoreStatus = (score) => {
  if (score < 0.80) return 'att';
  if (score < 0.95) return 'watch';
  return 'good';
};

// ── Public entry point ────────────────────────────────────────────────────────

export async function fetchDQ() {
  const mock = mockDQ();
  try {
    const sourcesRaw = await fetch('/api/sources').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    // Overlay live scores onto the 3 real sources (HR, Finance, Sales)
    for (const src of sourcesRaw) {
      const id = src.name.toLowerCase();
      if (!mock.SOURCES[id]) continue;
      for (const apiChk of src.checks) {
        const mockChk = mock.SOURCES[id].checks.find(
          c => c.dimension.toLowerCase() === apiChk.dimension && c.field === apiChk.field
        );
        if (mockChk) {
          mockChk.score  = apiChk.score;
          mockChk.issues = apiChk.issue_count;
          mockChk.total  = apiChk.total_count;
        }
      }
      mock.SOURCES[id].refreshedAt = src.latest_run_at;
    }
  } catch (e) {
    console.info('Using mock data — API unavailable:', e.message);
  }
  return mock;
}

// ── Shared helpers shared across mock and API paths ───────────────────────────

function makeDQ(SOURCES, LINEAGE, INCIDENTS, SOURCE_ORDER) {
  const DIMENSIONS   = ['Freshness', 'Uniqueness', 'Completeness', 'Validity', 'Consistency'];
  const STATUS       = { ATT: 'att', WATCH: 'watch', GOOD: 'good' };
  const STATUS_LABEL = { att: 'Needs attention', watch: 'Watching', good: 'Looks good' };

  const dimensionFor = (sourceId, dim) => {
    const checks = SOURCES[sourceId]?.checks.filter(c => c.dimension === dim) || [];
    return checks.length ? checks.reduce((w, c) => c.score < w.score ? c : w, checks[0]) : null;
  };

  const sourceSummary = (sourceId) => {
    const checks = SOURCES[sourceId]?.checks || [];
    const counts = { att: 0, watch: 0, good: 0 };
    let weighted = 0;
    for (const c of checks) { counts[scoreStatus(c.score)]++; weighted += c.score; }
    return {
      avg:    checks.length ? weighted / checks.length : 0,
      counts,
      worst:  checks.length ? scoreStatus(Math.min(...checks.map(c => c.score))) : 'good',
    };
  };

  const topIssues = () =>
    Object.values(SOURCES)
      .flatMap(src => src.checks.map(c => ({
        ...c, source: src.name, sourceId: src.id, status: scoreStatus(c.score),
      })))
      .sort((a, b) => a.score - b.score);

  const headlineStats = () => {
    const all    = Object.values(SOURCES).flatMap(s => s.checks);
    const counts = { att: 0, watch: 0, good: 0 };
    let total    = 0;
    for (const c of all) { counts[scoreStatus(c.score)]++; total += c.score; }
    const avg         = all.length ? total / all.length : 0;
    const totalIssues = all.reduce((s, c) => s + c.issues, 0);
    const totalRows   = all.reduce((s, c) => s + c.total,  0);
    const histLen     = Math.max(...all.map(c => c.history?.length || 0), 1);
    const composite   = Array.from({ length: histLen }, (_, i) => {
      const vals = all.map(c => c.history?.[i] ?? c.score);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    const totalRisk   = Object.values(SOURCES).reduce((s, src) => s + (src.businessImpact?.dailyRisk || 0), 0);
    const openInc     = INCIDENTS.filter(i => i.status !== 'resolved').length;
    const slaBreaches = INCIDENTS.filter(i => i.slaBreached).length;
    return {
      avg, attention: counts.att, watching: counts.watch, good: counts.good,
      totalChecks: all.length, totalIssues, totalRows, composite,
      totalRisk, openIncidents: openInc, slaBreaches,
    };
  };

  return {
    STATUS, STATUS_LABEL, SOURCES, SOURCE_ORDER, DIMENSIONS, LINEAGE, INCIDENTS,
    scoreStatus, dimensionFor, sourceSummary, topIssues, headlineStats,
  };
}

// ── Rich mock dataset ─────────────────────────────────────────────────────────

function mockDQ() {
  // 14-day daily history helpers
  const trend = (end, delta, jitter = 0.002) =>
    Array.from({ length: 14 }, (_, i) =>
      Math.min(1, Math.max(0, end - delta * (13 - i) + (Math.random() - 0.5) * jitter))
    );
  const flat  = (v, jitter = 0.002) => trend(v, 0, jitter);
  const spike = (base, dropAt, dropTo) =>
    Array.from({ length: 14 }, (_, i) =>
      i === dropAt ? dropTo : i > dropAt ? base - (base - dropTo) * Math.exp(-(i - dropAt) * 0.6) : base
    ).map(v => Math.min(1, Math.max(0, v)));

  const SOURCES = {

    // ── Orders (OMS) ───────────────────────────────────────────────────────
    orders: {
      id: 'orders', name: 'Orders', system: 'OMS',
      table: 'public.orders',
      description: 'eCommerce order management · 2.4M rows · Shopify + ERP sync · nightly + streaming',
      refreshedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      businessImpact: {
        dailyRisk: 8400, currency: '£',
        description: 'Partition gaps halt same-day dispatch reports and the Ops Dashboard. Each missing day costs ~£8,400 in delayed processing fees and SLA credits.',
        affectedReports: 4,
      },
      schemaEvents: [
        { column: 'order_margin_pct', change: 'Added (FLOAT)', detectedAt: '2026-05-18', severity: 'medium', note: 'Not in data contract — breaks 2 downstream dbt models' },
        { column: 'coupon_code',      change: 'Renamed → promo_code', detectedAt: '2026-05-15', severity: 'high', note: 'Breaking change — 3 views reference old name' },
      ],
      checks: [
        {
          dimension: 'Freshness', field: 'partition_age', score: 0.958,
          issues: 101339, total: 2412840,
          history: spike(1.000, 10, 0.941),
          complianceRisk: null,
          businessImpact: '£8,400/day — dispatch reports have no data for 2026-05-17 to 05-19',
          samples: [
            { partition_date: '2026-05-19', expected_rows: '~8,200', actual_rows: '0',     issue: 'Partition missing entirely' },
            { partition_date: '2026-05-18', expected_rows: '~8,400', actual_rows: '0',     issue: 'Partition missing entirely' },
            { partition_date: '2026-05-17', expected_rows: '~8,100', actual_rows: '3,847', issue: '53% gap — partial load failure' },
          ],
        },
        {
          dimension: 'Validity', field: 'order_status', score: 0.994,
          issues: 14477, total: 2412840,
          history: flat(0.994, 0.001),
          complianceRisk: null, businessImpact: null,
          samples: [
            { order_id: 'ORD-2024-09-0041', order_status: 'PENDING_LEGACY', issue: 'Deprecated status code — not in enum' },
            { order_id: 'ORD-2024-09-0118', order_status: 'SHIPPED_INT',    issue: 'Internal test value leaked to production' },
          ],
        },
        {
          dimension: 'Completeness', field: 'shipping_address', score: 0.982,
          issues: 43431, total: 2412840,
          history: trend(0.982, 0.0002),
          complianceRisk: null, businessImpact: null,
          samples: [
            { order_id: 'ORD-2024-11-8821', customer_id: 'CUS-00448', shipping_address: 'null', channel: 'POS' },
            { order_id: 'ORD-2024-11-8904', customer_id: 'CUS-01021', shipping_address: 'null', channel: 'POS' },
          ],
        },
        {
          dimension: 'Completeness', field: 'customer_id', score: 0.965,
          issues: 84449, total: 2412840,
          history: trend(0.965, 0.0004),
          complianceRisk: null,
          businessImpact: '84K orphaned orders — customer lifetime value calculations are understated',
          samples: [
            { order_id: 'ORD-2025-01-0029', customer_id: 'CUS-99102', issue: 'customer_id not found in customers table' },
            { order_id: 'ORD-2025-01-0034', customer_id: 'CUS-99108', issue: 'customer_id not found in customers table' },
            { order_id: 'ORD-2025-01-0041', customer_id: 'CUS-99117', issue: 'customer_id not found in customers table' },
          ],
        },
        {
          dimension: 'Validity', field: 'customer_email', score: 0.950,
          issues: 12064, total: 2412840,
          history: trend(0.950, 0.0001),
          complianceRisk: 'PII — customer email stored unmasked in analytics replica',
          businessImpact: 'GDPR Art. 25 — personal data visible to BI tooling without masking',
          samples: [
            { order_id: 'ORD-2025-03-1104', customer_email: 'j.smith@gmail.com', issue: 'Unmasked PII in analytics layer' },
            { order_id: 'ORD-2025-03-1188', customer_email: 'r.jones@outlook.com', issue: 'Unmasked PII in analytics layer' },
          ],
        },
      ],
      runs: Array.from({ length: 14 }, (_, i) => ({
        label: `D-${13 - i}`,
        scores: [
          i < 10 ? 1.000 : i === 10 ? 0.941 : 0.958,
          0.994, 0.982, 0.965 - i * 0.0001, 0.950,
        ],
      })),
    },

    // ── Finance (ERP / GL) ─────────────────────────────────────────────────
    finance: {
      id: 'finance', name: 'Finance', system: 'ERP',
      table: 'accounting.gl_transactions',
      description: 'General ledger · NetSuite nightly sync · 3.2M rows · powers board reporting',
      refreshedAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
      businessImpact: {
        dailyRisk: 2100, currency: '£',
        description: 'Missing cost centre codes block automated budget allocation. Q2 board report delayed by 2 days last cycle.',
        affectedReports: 3,
      },
      schemaEvents: [],
      checks: [
        {
          dimension: 'Freshness', field: 'posted_date', score: 1.000,
          issues: 0, total: 3210000,
          history: flat(1.000, 0.000),
          complianceRisk: null, businessImpact: null, samples: [],
        },
        {
          dimension: 'Completeness', field: 'cost_centre', score: 0.938,
          issues: 199000, total: 3210000,
          history: trend(0.938, 0.0002),
          complianceRisk: null,
          businessImpact: '199K transactions unallocated — budget variance reports show inflated "unallocated" line',
          samples: [
            { txn_id: 'TXN-2026-044821', amount: '£12,440', department: 'Engineering', cost_centre: 'null', posted: '2026-05-19' },
            { txn_id: 'TXN-2026-044902', amount: '£8,910',  department: 'Marketing',   cost_centre: 'null', posted: '2026-05-19' },
            { txn_id: 'TXN-2026-045001', amount: '£3,200',  department: 'null',         cost_centre: 'null', posted: '2026-05-20' },
          ],
        },
        {
          dimension: 'Completeness', field: 'currency', score: 0.921,
          issues: 255000, total: 3210000,
          history: trend(0.921, 0.0001),
          complianceRisk: null,
          businessImpact: '255K transactions assumed GBP — FX exposure miscalculated in treasury report',
          samples: [
            { txn_id: 'TXN-2026-039102', amount: '48,200', currency: 'null', vendor: 'AWS Frankfurt GmbH', posted: '2026-05-17' },
            { txn_id: 'TXN-2026-039410', amount: '22,800', currency: 'null', vendor: 'Azure Ireland',      posted: '2026-05-18' },
          ],
        },
        {
          dimension: 'Uniqueness', field: 'transaction_id', score: 0.935,
          issues: 210000, total: 3210000,
          history: trend(0.935, 0.0001),
          complianceRisk: null,
          businessImpact: 'Duplicate transactions inflate GL balance by est. £2.1M — flagged in last audit',
          samples: [
            { txn_id: 'TXN-2026-021004', duplicates: 2, amount: '£44,800', first_seen: '2026-04-30', last_seen: '2026-05-01' },
            { txn_id: 'TXN-2026-019881', duplicates: 3, amount: '£12,200', first_seen: '2026-04-28', last_seen: '2026-05-02' },
          ],
        },
        {
          dimension: 'Consistency', field: 'amount', score: 0.949,
          issues: 32000, total: 3210000,
          history: flat(0.949, 0.001),
          complianceRisk: null,
          businessImpact: 'Sign-convention mismatch — 32K invoices recorded as credits in GL',
          samples: [
            { txn_id: 'TXN-2026-041009', amount: '-£18,400', type: 'Invoice', vendor: 'Dell Technologies', issue: 'Negative invoice (should be debit)' },
            { txn_id: 'TXN-2026-041214', amount: '-£6,200',  type: 'Invoice', vendor: 'Adobe Inc.',       issue: 'Negative invoice (should be debit)' },
          ],
        },
      ],
      runs: Array.from({ length: 14 }, (_, i) => ({
        label: `D-${13 - i}`,
        scores: [1.000, 0.935 + i * 0.0001, 0.921 + i * 0.0001, 0.938 + i * 0.00005, 0.949],
      })),
    },

    // ── HR (HRIS) ──────────────────────────────────────────────────────────
    hr: {
      id: 'hr', name: 'HR', system: 'HRIS',
      table: 'hr.employees',
      description: 'Employee records · Workday daily export · 525 employees · feeds Payroll and Headcount reporting',
      refreshedAt: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
      businessImpact: {
        dailyRisk: 0, currency: '£',
        description: 'Issues are operational. Stale records and missing managers delay monthly headcount sign-off but do not directly block financial reporting.',
        affectedReports: 2,
      },
      schemaEvents: [],
      checks: [
        {
          dimension: 'Freshness', field: 'last_updated', score: 0.872,
          issues: 67, total: 525,
          history: trend(0.872, 0.0005),
          complianceRisk: null,
          businessImpact: '67 employee records not refreshed in 30+ days — headcount dashboard is stale',
          samples: [
            { employee_id: 'EMP-0441', name: 'A. Petrov',   last_updated: '2026-02-12', days_stale: 97, department: 'Engineering' },
            { employee_id: 'EMP-0208', name: 'S. Okafor',   last_updated: '2026-01-30', days_stale: 110, department: 'Sales' },
            { employee_id: 'EMP-0319', name: 'M. Lindqvist',last_updated: '2025-12-15', days_stale: 156, department: 'Finance' },
          ],
        },
        {
          dimension: 'Completeness', field: 'manager_id', score: 0.928,
          issues: 38, total: 525,
          history: flat(0.928, 0.002),
          complianceRisk: null, businessImpact: '38 employees without manager assignment — approval workflows blocked',
          samples: [
            { employee_id: 'EMP-0512', name: 'T. Rahman',  hire_date: '2026-04-15', manager_id: 'null', note: 'New hire — manager not yet assigned' },
            { employee_id: 'EMP-0509', name: 'L. Nowak',   hire_date: '2026-04-08', manager_id: 'null', note: 'New hire — manager not yet assigned' },
          ],
        },
        {
          dimension: 'Uniqueness', field: 'email', score: 0.952,
          issues: 25, total: 525,
          history: flat(0.952, 0.001),
          complianceRisk: null, businessImpact: null,
          samples: [
            { email: 'j.brown@company.com', occurrences: 2, employee_ids: 'EMP-0112, EMP-9112', note: 'Migration duplicate — EMP-9112 is clone' },
          ],
        },
        {
          dimension: 'Consistency', field: 'hire_date', score: 0.954,
          issues: 24, total: 525,
          history: flat(0.954, 0.001),
          complianceRisk: null, businessImpact: null,
          samples: [
            { employee_id: 'EMP-0499', hire_date: '2027-01-15', last_updated: '2026-05-10', issue: 'Hire date in the future' },
            { employee_id: 'EMP-0502', hire_date: '2026-12-01', last_updated: '2026-04-22', issue: 'Hire date in the future' },
          ],
        },
        {
          dimension: 'Validity', field: 'email', score: 0.975,
          issues: 13, total: 525,
          history: flat(0.975, 0.001),
          complianceRisk: null, businessImpact: null,
          samples: [
            { employee_id: 'EMP-0088', email: 'michael.scottcompany.com', issue: 'Missing @ — manual entry error' },
            { employee_id: 'EMP-0201', email: 'admin@',                   issue: 'Incomplete domain' },
          ],
        },
      ],
      runs: Array.from({ length: 14 }, (_, i) => ({
        label: `D-${13 - i}`,
        scores: [0.880 - i * 0.00057, 0.928, 0.952, 0.954, 0.975],
      })),
    },

    // ── Sales (CRM) ────────────────────────────────────────────────────────
    sales: {
      id: 'sales', name: 'Sales', system: 'CRM',
      table: 'crm.deals',
      description: 'Deal pipeline · Salesforce daily export · 1,472 open deals · powers revenue forecasting',
      refreshedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      businessImpact: {
        dailyRisk: 4500, currency: '£',
        description: 'Freshness failure means the pipeline forecast is running on data that is over a year old for 72% of deals. Board forecast accuracy is materially impaired.',
        affectedReports: 3,
      },
      schemaEvents: [],
      checks: [
        {
          dimension: 'Freshness', field: 'created_date', score: 0.275,
          issues: 435, total: 600,
          history: [0.340, 0.328, 0.318, 0.310, 0.303, 0.298, 0.291, 0.286, 0.281, 0.279, 0.278, 0.276, 0.275, 0.275],
          complianceRisk: null,
          businessImpact: '435 deals not refreshed in 365 days — pipeline value of £18.2M is based on stale data',
          samples: [
            { deal_id: 'DEAL-0041', account: 'Meridian Group',   stage: 'Negotiation', value: '£240,000', last_activity: '2024-11-20', days_stale: 181 },
            { deal_id: 'DEAL-0092', account: 'Apex Logistics',   stage: 'Proposal',    value: '£85,000',  last_activity: '2025-01-04', days_stale: 136 },
            { deal_id: 'DEAL-0118', account: 'Stonehaven Retail', stage: 'Discovery',  value: '£320,000', last_activity: '2024-10-15', days_stale: 217 },
          ],
        },
        {
          dimension: 'Uniqueness', field: 'email', score: 0.915,
          issues: 74, total: 872,
          history: [0.902, 0.905, 0.908, 0.909, 0.910, 0.911, 0.912, 0.912, 0.913, 0.913, 0.914, 0.914, 0.915, 0.915],
          complianceRisk: null,
          businessImpact: '74 duplicate customer records — sales reps double-pitching same accounts',
          samples: [
            { email: 'procurement@meridiangroup.co.uk', customer_ids: 'CUS-0412, CUS-9412', note: 'CRM merge artefact' },
            { email: 'info@apexlogistics.com',          customer_ids: 'CUS-0801, CUS-9801', note: 'CRM merge artefact' },
          ],
        },
        {
          dimension: 'Validity', field: 'stage', score: 0.937,
          issues: 38, total: 600,
          history: flat(0.937, 0.001),
          complianceRisk: null, businessImpact: 'Deprecated pipeline stages — forecast model cannot classify 38 deals',
          samples: [
            { deal_id: 'DEAL-0219', stage: 'SQL',          issue: 'Deprecated — maps to Qualified in new schema' },
            { deal_id: 'DEAL-0241', stage: 'DEMO_BOOKED',  issue: 'Deprecated — maps to Discovery in new schema' },
          ],
        },
        {
          dimension: 'Consistency', field: 'close_date', score: 0.945,
          issues: 33, total: 600,
          history: flat(0.945, 0.001),
          complianceRisk: null, businessImpact: null,
          samples: [
            { deal_id: 'DEAL-0088', created_date: '2025-06-10', close_date: '2025-04-01', issue: 'Close date before created date — data migration error' },
          ],
        },
        {
          dimension: 'Consistency', field: 'revenue', score: 0.945,
          issues: 5, total: 91,
          history: flat(0.945, 0.002),
          complianceRisk: null,
          businessImpact: '5 Closed Won deals with £0 revenue — quote system sync failure',
          samples: [
            { deal_id: 'DEAL-0302', stage: 'Closed Won', revenue: '£0', closed_date: '2026-04-22', issue: 'Quote not synced from CPQ' },
            { deal_id: 'DEAL-0318', stage: 'Closed Won', revenue: '£0', closed_date: '2026-05-01', issue: 'Quote not synced from CPQ' },
          ],
        },
        {
          dimension: 'Completeness', field: 'deal_owner', score: 0.953,
          issues: 28, total: 600,
          history: flat(0.953, 0.001),
          complianceRisk: null, businessImpact: '28 deals unowned — at risk of going cold with no follow-up', samples: [],
        },
      ],
      runs: Array.from({ length: 14 }, (_, i) => ({
        label: `D-${13 - i}`,
        scores: [0.340 - i * 0.00464, 0.902 + i * 0.00046, 0.937, 0.945, 0.945, 0.953],
      })),
    },

    // ── Products (PIM) ─────────────────────────────────────────────────────
    products: {
      id: 'products', name: 'Products', system: 'PIM',
      table: 'catalog.sku_master',
      description: 'Product catalogue · Akeneo PIM · 89,234 active SKUs · feeds marketplace and B2B portal',
      refreshedAt: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
      businessImpact: {
        dailyRisk: 2100, currency: '£',
        description: 'SKUs missing EAN barcodes are rejected by Amazon and Google Shopping feeds. Each delisted product costs ~£140/day in estimated lost conversion.',
        affectedReports: 2,
      },
      schemaEvents: [
        { column: 'wholesale_price', change: 'Added (DECIMAL 10,2)', detectedAt: '2026-05-16', severity: 'medium', note: 'Undocumented column — breaks strict schema validation in B2B feed' },
        { column: 'supplier_code',   change: 'Type changed VARCHAR(6) → VARCHAR(10)', detectedAt: '2026-05-12', severity: 'low', note: 'Backward compatible but violates contract with pricing service' },
      ],
      checks: [
        {
          dimension: 'Validity', field: 'ean_barcode', score: 0.831,
          issues: 15097, total: 89234,
          history: trend(0.831, 0.001),
          complianceRisk: null,
          businessImpact: '15K SKUs rejected by marketplace feeds — est. £2,100/day conversion loss',
          samples: [
            { sku_id: 'SKU-441820', product_name: 'Wireless Headset Pro X',     ean_barcode: 'null',        issue: 'Missing EAN — required for Amazon listing' },
            { sku_id: 'SKU-441904', product_name: 'USB-C Hub 7-Port',           ean_barcode: '9999999999',  issue: 'Invalid EAN-13 checksum' },
            { sku_id: 'SKU-442018', product_name: 'Laptop Stand Aluminium',     ean_barcode: '123',         issue: 'EAN too short — must be 8 or 13 digits' },
          ],
        },
        {
          dimension: 'Completeness', field: 'category', score: 0.921,
          issues: 7077, total: 89234,
          history: trend(0.921, 0.0005),
          complianceRisk: null,
          businessImpact: '7K uncategorised SKUs excluded from browse navigation and recommendation engine',
          samples: [
            { sku_id: 'SKU-441288', product_name: 'HDMI 2.1 Cable 2m', category: 'null', created_at: '2026-05-01', note: 'Batch import — category mapping failed' },
            { sku_id: 'SKU-441302', product_name: 'Power Bank 20000mAh', category: 'null', created_at: '2026-05-01', note: 'Batch import — category mapping failed' },
          ],
        },
        {
          dimension: 'Completeness', field: 'description', score: 0.942,
          issues: 5178, total: 89234,
          history: flat(0.942, 0.001),
          complianceRisk: null, businessImpact: '5K SKUs with no product description — poor search ranking and conversion', samples: [],
        },
        {
          dimension: 'Freshness', field: 'last_synced', score: 0.961,
          issues: 3480, total: 89234,
          history: flat(0.961, 0.001),
          complianceRisk: null, businessImpact: null, samples: [],
        },
        {
          dimension: 'Uniqueness', field: 'sku_code', score: 0.997,
          issues: 269, total: 89234,
          history: flat(0.997, 0.0005),
          complianceRisk: null, businessImpact: null, samples: [],
        },
      ],
      runs: Array.from({ length: 14 }, (_, i) => ({
        label: `D-${13 - i}`,
        scores: [0.831, 0.921 - i * 0.00005, 0.942, 0.961, 0.997],
      })),
    },

    // ── Marketing (CDP) ────────────────────────────────────────────────────
    marketing: {
      id: 'marketing', name: 'Marketing', system: 'CDP',
      table: 'cdp.profiles',
      description: 'Customer data platform · 1.2M profiles · EU & UK · powers email, push, paid media',
      refreshedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      businessImpact: {
        dailyRisk: 12000, currency: '£',
        description: '347K EU profiles receiving campaigns without valid GDPR consent. Regulatory fine risk up to €20M or 4% global turnover under GDPR Art. 83(5).',
        affectedReports: 5,
      },
      schemaEvents: [],
      checks: [
        {
          dimension: 'Validity', field: 'consent_flag', score: 0.721,
          issues: 347701, total: 1245890,
          history: [0.802, 0.798, 0.791, 0.782, 0.776, 0.769, 0.762, 0.755, 0.748, 0.741, 0.735, 0.729, 0.724, 0.721],
          complianceRisk: 'GDPR Art. 6 — EU profiles receiving marketing without lawful consent basis',
          businessImpact: 'CRITICAL compliance breach — 347K profiles. Potential fine: up to €20M / 4% global revenue.',
          samples: [
            { profile_id: 'PRF-EU-4421930', country: 'DE', email: 'a.m***@gmail.com',  consent_flag: 'null',     last_email_sent: '2026-05-19', campaigns_sent: 14 },
            { profile_id: 'PRF-EU-4418827', country: 'FR', email: 'j.b***@orange.fr',  consent_flag: 'null',     last_email_sent: '2026-05-18', campaigns_sent: 9  },
            { profile_id: 'PRF-EU-4415203', country: 'NL', email: 'k.v***@xs4all.nl',  consent_flag: 'expired',  last_email_sent: '2026-05-20', campaigns_sent: 22 },
            { profile_id: 'PRF-EU-4409881', country: 'ES', email: 'r.g***@hotmail.com', consent_flag: 'null',    last_email_sent: '2026-05-17', campaigns_sent: 7  },
          ],
        },
        {
          dimension: 'Uniqueness', field: 'profile_id', score: 0.934,
          issues: 82229, total: 1245890,
          history: trend(0.934, 0.0002),
          complianceRisk: null,
          businessImpact: '82K duplicate profiles — customers receiving duplicate sends, unsubscribes not propagating',
          samples: [
            { profile_id: 'PRF-0481020', duplicate_of: 'PRF-0480988', match_reason: 'email + postcode', campaigns_doubled: 8 },
            { profile_id: 'PRF-0481304', duplicate_of: 'PRF-0481188', match_reason: 'email',            campaigns_doubled: 5 },
          ],
        },
        {
          dimension: 'Freshness', field: 'last_activity', score: 0.892,
          issues: 135428, total: 1245890,
          history: trend(0.892, 0.0003),
          complianceRisk: null,
          businessImpact: '135K profiles inactive >180 days — deliverability risk if emailed (spam trap exposure)',
          samples: [
            { profile_id: 'PRF-0102441', last_activity: '2025-10-01', days_inactive: 231, email_opens_last_90d: 0, note: 'High bounce risk' },
          ],
        },
        {
          dimension: 'Completeness', field: 'email', score: 0.963,
          issues: 46099, total: 1245890,
          history: flat(0.963, 0.001),
          complianceRisk: null, businessImpact: null, samples: [],
        },
        {
          dimension: 'Validity', field: 'email_domain', score: 0.978,
          issues: 27409, total: 1245890,
          history: flat(0.978, 0.001),
          complianceRisk: null, businessImpact: null, samples: [],
        },
      ],
      runs: Array.from({ length: 14 }, (_, i) => ({
        label: `D-${13 - i}`,
        scores: [0.802 - i * 0.0057, 0.934 - i * 0.00014, 0.892 - i * 0.00021, 0.963, 0.978],
      })),
    },

    // ── Payments (PSP) ─────────────────────────────────────────────────────
    payments: {
      id: 'payments', name: 'Payments', system: 'PSP',
      table: 'payments.txn_log',
      description: 'Payment transaction log · Stripe + Adyen · 892K transactions · PCI DSS scope',
      refreshedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      businessImpact: {
        dailyRisk: 0, currency: '£',
        description: 'PCI DSS scope. Card data detected in log entries that are shipped to the analytics warehouse. This is a mandatory disclosure event with a 72-hour regulatory deadline.',
        affectedReports: 4,
      },
      schemaEvents: [],
      checks: [
        {
          dimension: 'Validity', field: 'sensitive_in_logs', score: 0.966,
          issues: 30343, total: 892441,
          history: spike(0.999, 9, 0.961),
          complianceRisk: 'PCI DSS Req. 3 — card data must not appear in logs. Logs shipped to analytics S3 bucket.',
          businessImpact: 'MANDATORY DISCLOSURE — PCI DSS breach. 30K log entries contain card_last4 or card_brand. 72h disclosure deadline from detection.',
          samples: [
            { log_id: 'LOG-8821947', event: 'payment_init',  sensitive_field: 'card_last4',  value: '****1234', timestamp: '2026-05-20 09:14:32', destination: 'analytics-s3' },
            { log_id: 'LOG-8820103', event: '3ds_challenge', sensitive_field: 'card_brand',   value: 'VISA',     timestamp: '2026-05-20 08:57:18', destination: 'analytics-s3' },
            { log_id: 'LOG-8818844', event: 'payment_init',  sensitive_field: 'card_last4',  value: '****9201', timestamp: '2026-05-20 08:41:07', destination: 'analytics-s3' },
          ],
        },
        {
          dimension: 'Completeness', field: 'settlement_date', score: 0.918,
          issues: 73179, total: 892441,
          history: trend(0.918, 0.0001),
          complianceRisk: null,
          businessImpact: '73K successful payments without settlement date — cash flow forecast understated by est. £4.1M',
          samples: [
            { txn_id: 'TXN-PSP-0441820', amount: '£2,400', status: 'succeeded', settled: 'null', payment_method: 'card', issue: 'Settlement date not populated by PSP webhook' },
            { txn_id: 'TXN-PSP-0441904', amount: '£8,100', status: 'succeeded', settled: 'null', payment_method: 'BACS', issue: 'Settlement date not populated by PSP webhook' },
          ],
        },
        {
          dimension: 'Consistency', field: 'amount_reconciliation', score: 0.949,
          issues: 45514, total: 892441,
          history: flat(0.949, 0.001),
          complianceRisk: null,
          businessImpact: 'Authorised amount ≠ settled amount for 45K transactions — £1.2M unreconciled',
          samples: [
            { txn_id: 'TXN-PSP-0389021', authorised: '£120.00', settled: '£118.50', gap: '-£1.50', issue: 'FX slippage > 1% threshold' },
          ],
        },
        {
          dimension: 'Validity', field: 'currency_code', score: 0.976,
          issues: 21399, total: 892441,
          history: flat(0.976, 0.001),
          complianceRisk: null, businessImpact: null,
          samples: [
            { txn_id: 'TXN-PSP-0201441', currency: 'EUR', issue: 'EUR not in ISO 4217 — should be EUR' },
            { txn_id: 'TXN-PSP-0201892', currency: 'GBP ', issue: 'Trailing whitespace breaks downstream parser' },
          ],
        },
        {
          dimension: 'Freshness', field: 'batch_lag', score: 0.988,
          issues: 10709, total: 892441,
          history: flat(0.988, 0.001),
          complianceRisk: null, businessImpact: null, samples: [],
        },
      ],
      runs: Array.from({ length: 14 }, (_, i) => ({
        label: `D-${13 - i}`,
        scores: [
          i < 9 ? 0.999 : i === 9 ? 0.961 : 0.966,
          0.918, 0.949, 0.976, 0.988,
        ],
      })),
    },
  };

  // ── Lineage ───────────────────────────────────────────────────────────────

  const LINEAGE = {
    orders: {
      source: { id: 'orders', name: 'Orders', system: 'OMS' },
      checks: [
        { id: 'orders-freshness-partition_age',     label: 'freshness / partition_age',     score: 0.958, status: 'watch' },
        { id: 'orders-validity-customer_email',     label: 'validity / customer_email',     score: 0.950, status: 'watch' },
        { id: 'orders-completeness-customer_id',    label: 'completeness / customer_id',    score: 0.965, status: 'watch' },
      ],
      downstream: [
        { id: 'same-day-dispatch',    name: 'Same-Day Dispatch Report', kind: 'Report',    impactedBy: ['orders-freshness-partition_age'] },
        { id: 'ops-dashboard',        name: 'Ops Dashboard',            kind: 'Dashboard', impactedBy: ['orders-freshness-partition_age'] },
        { id: 'analytics-warehouse',  name: 'Analytics Warehouse',      kind: 'Pipeline',  impactedBy: ['orders-validity-customer_email'] },
        { id: 'clv-model',            name: 'CLV Model',                kind: 'Model',     impactedBy: ['orders-completeness-customer_id'] },
      ],
    },
    finance: {
      source: { id: 'finance', name: 'Finance', system: 'ERP' },
      checks: [
        { id: 'finance-completeness-cost_centre',    label: 'completeness / cost_centre',    score: 0.938, status: 'watch' },
        { id: 'finance-completeness-currency',       label: 'completeness / currency',       score: 0.921, status: 'watch' },
        { id: 'finance-uniqueness-transaction_id',   label: 'uniqueness / transaction_id',   score: 0.935, status: 'watch' },
        { id: 'finance-consistency-amount',          label: 'consistency / amount',          score: 0.949, status: 'watch' },
      ],
      downstream: [
        { id: 'ap-ledger',          name: 'AP Ledger',          kind: 'Ledger',    impactedBy: ['finance-completeness-currency', 'finance-uniqueness-transaction_id', 'finance-completeness-cost_centre'] },
        { id: 'board-finance-pack', name: 'Board Finance Pack', kind: 'Report',    impactedBy: ['finance-consistency-amount', 'finance-completeness-cost_centre'] },
        { id: 'treasury-report',    name: 'Treasury FX Report', kind: 'Report',    impactedBy: ['finance-completeness-currency'] },
      ],
    },
    hr: {
      source: { id: 'hr', name: 'HR', system: 'HRIS' },
      checks: [
        { id: 'hr-freshness-last_updated',    label: 'freshness / last_updated', score: 0.872, status: 'watch' },
        { id: 'hr-completeness-manager_id',   label: 'completeness / manager_id', score: 0.928, status: 'watch' },
      ],
      downstream: [
        { id: 'headcount-dashboard', name: 'Headcount Dashboard', kind: 'Dashboard', impactedBy: ['hr-freshness-last_updated'] },
        { id: 'payroll-report',      name: 'Payroll Report',      kind: 'Report',    impactedBy: ['hr-completeness-manager_id'] },
      ],
    },
    sales: {
      source: { id: 'sales', name: 'Sales', system: 'CRM' },
      checks: [
        { id: 'sales-freshness-created_date', label: 'freshness / created_date', score: 0.275, status: 'att' },
        { id: 'sales-uniqueness-email',       label: 'uniqueness / email',        score: 0.915, status: 'watch' },
        { id: 'sales-validity-stage',         label: 'validity / stage',          score: 0.937, status: 'watch' },
      ],
      downstream: [
        { id: 'pipeline-forecast',   name: 'Pipeline Forecast',  kind: 'Dashboard', impactedBy: ['sales-freshness-created_date', 'sales-validity-stage'] },
        { id: 'revenue-dashboard',   name: 'Revenue Dashboard',  kind: 'Dashboard', impactedBy: ['sales-uniqueness-email'] },
        { id: 'board-revenue',       name: 'Board Revenue Pack', kind: 'Report',    impactedBy: ['sales-freshness-created_date'] },
      ],
    },
    products: {
      source: { id: 'products', name: 'Products', system: 'PIM' },
      checks: [
        { id: 'products-validity-ean_barcode',    label: 'validity / ean_barcode', score: 0.831, status: 'watch' },
        { id: 'products-completeness-category',   label: 'completeness / category', score: 0.921, status: 'watch' },
      ],
      downstream: [
        { id: 'amazon-feed',    name: 'Amazon Product Feed',  kind: 'Pipeline',  impactedBy: ['products-validity-ean_barcode'] },
        { id: 'google-feed',    name: 'Google Shopping Feed', kind: 'Pipeline',  impactedBy: ['products-validity-ean_barcode'] },
        { id: 'b2b-portal',     name: 'B2B Customer Portal',  kind: 'Dashboard', impactedBy: ['products-completeness-category'] },
      ],
    },
    marketing: {
      source: { id: 'marketing', name: 'Marketing', system: 'CDP' },
      checks: [
        { id: 'marketing-validity-consent_flag',   label: 'validity / consent_flag',  score: 0.721, status: 'att' },
        { id: 'marketing-uniqueness-profile_id',   label: 'uniqueness / profile_id',  score: 0.934, status: 'watch' },
        { id: 'marketing-freshness-last_activity', label: 'freshness / last_activity', score: 0.892, status: 'watch' },
      ],
      downstream: [
        { id: 'eu-email-campaigns',  name: 'EU Email Campaigns',         kind: 'Pipeline',  impactedBy: ['marketing-validity-consent_flag'] },
        { id: 'gdpr-dashboard',      name: 'GDPR Compliance Dashboard',  kind: 'Dashboard', impactedBy: ['marketing-validity-consent_flag'] },
        { id: 'paid-audiences',      name: 'Paid Media Audiences',       kind: 'Pipeline',  impactedBy: ['marketing-uniqueness-profile_id'] },
      ],
    },
    payments: {
      source: { id: 'payments', name: 'Payments', system: 'PSP' },
      checks: [
        { id: 'payments-validity-sensitive_in_logs',     label: 'validity / sensitive_in_logs',     score: 0.966, status: 'watch' },
        { id: 'payments-completeness-settlement_date',   label: 'completeness / settlement_date',   score: 0.918, status: 'watch' },
        { id: 'payments-consistency-amount_reconciliation', label: 'consistency / amount_reconciliation', score: 0.949, status: 'watch' },
      ],
      downstream: [
        { id: 'pci-log-archive',     name: 'PCI Log Archive (S3)',     kind: 'Pipeline',  impactedBy: ['payments-validity-sensitive_in_logs'] },
        { id: 'cashflow-forecast',   name: 'Cash Flow Forecast',       kind: 'Dashboard', impactedBy: ['payments-completeness-settlement_date'] },
        { id: 'reconciliation-feed', name: 'Reconciliation Feed',      kind: 'Report',    impactedBy: ['payments-consistency-amount_reconciliation'] },
        { id: 'finance-warehouse',   name: 'Finance Data Warehouse',   kind: 'Pipeline',  impactedBy: ['payments-validity-sensitive_in_logs', 'payments-consistency-amount_reconciliation'] },
      ],
    },
  };

  // ── Incidents ─────────────────────────────────────────────────────────────

  const INCIDENTS = [
    {
      id: 'INC-0041',
      severity: 'critical',
      source: 'orders',
      check: 'partition_age',
      title: 'Orders · 3 daily partitions missing',
      detail: 'public.orders has no data for 2026-05-17 to 05-19. Same-Day Dispatch Report and Ops Dashboard have stale data. Root cause: Shopify webhook timeout during maintenance window.',
      detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: 'open',
      slaBreached: true,
      impact: '£8,400 revenue risk',
      affectedAssets: ['Same-Day Dispatch Report', 'Ops Dashboard'],
      owner: 'Data Engineering',
    },
    {
      id: 'INC-0040',
      severity: 'critical',
      source: 'marketing',
      check: 'consent_flag',
      title: 'Marketing · 347K EU profiles without GDPR consent',
      detail: 'EU profiles with null or expired consent_flag are being included in active email campaigns. Consent sync from consent management platform has been failing silently for 14 days.',
      detectedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      status: 'investigating',
      slaBreached: true,
      impact: 'Up to €20M GDPR fine risk',
      affectedAssets: ['EU Email Campaigns', 'GDPR Compliance Dashboard'],
      owner: 'Data Governance',
    },
    {
      id: 'INC-0039',
      severity: 'high',
      source: 'payments',
      check: 'sensitive_in_logs',
      title: 'Payments · Card data in log entries',
      detail: '30K payment log entries contain card_last4 and card_brand in plaintext. Logs are shipped to the analytics S3 bucket which is accessible to BI tooling. PCI DSS mandatory disclosure deadline: 2026-05-23.',
      detectedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      status: 'open',
      slaBreached: false,
      impact: 'PCI DSS breach — 72h disclosure deadline',
      affectedAssets: ['PCI Log Archive (S3)', 'Finance Data Warehouse'],
      owner: 'Security',
    },
    {
      id: 'INC-0038',
      severity: 'medium',
      source: 'finance',
      check: 'cost_centre',
      title: 'Finance · Missing cost centre codes spike',
      detail: '199K GL transactions without cost_centre were loaded from a NetSuite export that skipped the mapping step. Q2 budget allocation report was delayed by 2 days.',
      detectedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'resolved',
      slaBreached: false,
      impact: '£12,000 delayed reporting cost',
      affectedAssets: ['AP Ledger', 'Board Finance Pack'],
      owner: 'Analytics Engineering',
    },
    {
      id: 'INC-0037',
      severity: 'low',
      source: 'products',
      check: 'ean_barcode',
      title: 'Products · Batch import dropped EAN barcodes',
      detail: 'A batch import of 15K SKUs from a new supplier failed to map EAN barcodes. Products were live on site without marketplace feed eligibility for 18 hours.',
      detectedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'resolved',
      slaBreached: false,
      impact: '£2,100 estimated conversion loss',
      affectedAssets: ['Amazon Product Feed', 'Google Shopping Feed'],
      owner: 'Catalogue Team',
    },
  ];

  const SOURCE_ORDER = ['orders', 'payments', 'marketing', 'finance', 'sales', 'products', 'hr'];

  return makeDQ(SOURCES, LINEAGE, INCIDENTS, SOURCE_ORDER);
}
