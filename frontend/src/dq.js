// Data layer — fetches from the real API, falls back to mock data.
// Transforms API shapes into the format components expect.

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const TAG_TO_STATUS = { FAIL: 'att', WARN: 'watch', OK: 'good' };

export const scoreStatus = (score) => {
  if (score < 0.80) return 'att';
  if (score < 0.95) return 'watch';
  return 'good';
};

// ── Real API fetch ────────────────────────────────────────────────────────────

export async function fetchDQ() {
  try {
    const sourcesRaw = await fetch('/api/sources').then(r => {
      if (!r.ok) throw new Error(`/api/sources ${r.status}`);
      return r.json();
    });

    const names = sourcesRaw.map(s => s.name);

    const [runsAll, lineageAll] = await Promise.all([
      Promise.all(names.map(n =>
        fetch(`/api/runs/${n}`).then(r => r.json()).then(data => ({ name: n, data }))
      )),
      Promise.all(names.map(n =>
        fetch(`/api/lineage/${n}`).then(r => r.json()).then(data => ({ name: n, data }))
      )),
    ]);

    const runsMap    = Object.fromEntries(runsAll.map(({ name, data }) => [name, data]));
    const lineageMap = Object.fromEntries(lineageAll.map(({ name, data }) => [name, data]));

    return buildDQ(sourcesRaw, runsMap, lineageMap);
  } catch (e) {
    console.warn('API unavailable — using mock data:', e.message);
    return mockDQ();
  }
}

// ── Transform API → component shape ──────────────────────────────────────────

function buildDQ(sourcesRaw, runsMap, lineageMap) {
  const SOURCES = {};

  for (const src of sourcesRaw) {
    const id   = src.name.toLowerCase();
    const runs = (runsMap[src.name] || [])
      .slice()
      .sort((a, b) => new Date(a.run_at) - new Date(b.run_at));
    const last5 = runs.slice(-5);

    const checks = src.checks.map(c => {
      const history = last5.map(run => {
        const m = run.metrics.find(m => m.dimension === c.dimension && m.field === c.field);
        return m ? m.score : c.score;
      });
      return {
        dimension: cap(c.dimension),
        field:     c.field,
        score:     c.score,
        issues:    c.issue_count,
        total:     c.total_count,
        history:   history.length ? history : [c.score],
      };
    }).sort((a, b) => a.score - b.score);

    const trendRuns = last5.map(run => ({
      label:  new Date(run.run_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      scores: checks.map(chk => {
        const m = run.metrics.find(m =>
          m.dimension === chk.dimension.toLowerCase() && m.field === chk.field
        );
        return m ? m.score : chk.score;
      }),
    }));

    SOURCES[id] = {
      id,
      name:        src.name,
      system:      src.system_type,
      description: src.description || `${src.system_type} data source`,
      refreshedAt: src.latest_run_at,
      checks,
      runs: trendRuns.length ? trendRuns : [{ label: 'latest', scores: checks.map(c => c.score) }],
    };
  }

  const LINEAGE = {};

  for (const src of sourcesRaw) {
    const id      = src.name.toLowerCase();
    const lineage = lineageMap[src.name];
    const failing = lineage?.failing_checks || [];

    const checks = failing.map(fc => ({
      id:     `${id}-${fc.dimension}-${fc.field}`,
      label:  `${fc.dimension} / ${fc.field}`,
      score:  fc.score,
      status: TAG_TO_STATUS[fc.tag] || scoreStatus(fc.score),
    }));

    const assetMap = new Map();
    for (const fc of failing) {
      const checkId = `${id}-${fc.dimension}-${fc.field}`;
      for (const asset of (fc.impacted_assets || [])) {
        if (!assetMap.has(asset.name)) {
          assetMap.set(asset.name, {
            id:         asset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            name:       asset.name,
            kind:       cap(asset.type),
            impactedBy: [],
          });
        }
        assetMap.get(asset.name).impactedBy.push(checkId);
      }
    }

    LINEAGE[id] = {
      source:     { id, name: src.name, system: src.system_type },
      checks,
      downstream: Array.from(assetMap.values()),
    };
  }

  return makeDQ(SOURCES, LINEAGE);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeDQ(SOURCES, LINEAGE) {
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

  const topIssues = () => {
    return Object.values(SOURCES)
      .flatMap(src => src.checks.map(c => ({
        ...c, source: src.name, sourceId: src.id, status: scoreStatus(c.score),
      })))
      .sort((a, b) => a.score - b.score);
  };

  const headlineStats = () => {
    const all = Object.values(SOURCES).flatMap(s => s.checks);
    const counts = { att: 0, watch: 0, good: 0 };
    let total = 0;
    for (const c of all) { counts[scoreStatus(c.score)]++; total += c.score; }
    const avg          = all.length ? total / all.length : 0;
    const totalIssues  = all.reduce((s, c) => s + c.issues, 0);
    const totalRows    = all.reduce((s, c) => s + c.total, 0);
    const histLen      = Math.max(...all.map(c => c.history?.length || 0), 1);
    const composite    = Array.from({ length: histLen }, (_, i) => {
      const vals = all.map(c => c.history?.[i] ?? c.score);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    return {
      avg, attention: counts.att, watching: counts.watch, good: counts.good,
      totalChecks: all.length, totalIssues, totalRows, composite,
    };
  };

  return { STATUS, STATUS_LABEL, SOURCES, DIMENSIONS, LINEAGE, scoreStatus, dimensionFor, sourceSummary, topIssues, headlineStats };
}

// ── Mock fallback (matches Claude Design data.js exactly) ─────────────────────

function mockDQ() {
  const SOURCES = {
    sales: {
      id: 'sales', name: 'Sales', system: 'CRM',
      description: 'CRM customer and deal export · imported from Salesforce',
      refreshedAt: new Date().toISOString(),
      checks: [
        { dimension: 'Freshness',    field: 'created_date', score: 0.275, issues: 435, total: 600,  history: [0.310, 0.298, 0.286, 0.281, 0.275] },
        { dimension: 'Uniqueness',   field: 'email',        score: 0.915, issues: 74,  total: 872,  history: [0.902, 0.908, 0.910, 0.913, 0.915] },
        { dimension: 'Validity',     field: 'stage',        score: 0.937, issues: 38,  total: 600,  history: [0.928, 0.932, 0.934, 0.936, 0.937] },
        { dimension: 'Consistency',  field: 'close_date',   score: 0.945, issues: 33,  total: 600,  history: [0.940, 0.942, 0.944, 0.945, 0.945] },
        { dimension: 'Consistency',  field: 'revenue',      score: 0.945, issues: 5,   total: 91,   history: [0.948, 0.946, 0.945, 0.946, 0.945] },
        { dimension: 'Completeness', field: 'deal_owner',   score: 0.953, issues: 28,  total: 600,  history: [0.948, 0.950, 0.951, 0.952, 0.953] },
      ],
      runs: [
        { label: '04:00', scores: [0.310, 0.902, 0.928, 0.940, 0.948, 0.948] },
        { label: '07:00', scores: [0.298, 0.908, 0.932, 0.942, 0.946, 0.950] },
        { label: '10:00', scores: [0.286, 0.910, 0.934, 0.944, 0.945, 0.951] },
        { label: '11:00', scores: [0.281, 0.913, 0.936, 0.945, 0.946, 0.952] },
        { label: '12:00', scores: [0.275, 0.915, 0.937, 0.945, 0.945, 0.953] },
      ],
    },
    finance: {
      id: 'finance', name: 'Finance', system: 'ERP',
      description: 'GL / ERP transaction export · NetSuite nightly',
      refreshedAt: new Date().toISOString(),
      checks: [
        { dimension: 'Completeness', field: 'currency',       score: 0.921, issues: 255, total: 3210, history: [0.918, 0.919, 0.920, 0.920, 0.921] },
        { dimension: 'Uniqueness',   field: 'transaction_id', score: 0.935, issues: 210, total: 3210, history: [0.930, 0.932, 0.933, 0.934, 0.935] },
        { dimension: 'Completeness', field: 'cost_centre',    score: 0.938, issues: 199, total: 3210, history: [0.936, 0.937, 0.937, 0.938, 0.938] },
        { dimension: 'Consistency',  field: 'amount',         score: 0.949, issues: 32,  total: 632,  history: [0.945, 0.946, 0.948, 0.948, 0.949] },
        { dimension: 'Validity',     field: 'amount',         score: 0.964, issues: 22,  total: 613,  history: [0.960, 0.962, 0.963, 0.964, 0.964] },
        { dimension: 'Freshness',    field: 'posted_date',    score: 1.000, issues: 0,   total: 3210, history: [1.000, 1.000, 1.000, 1.000, 1.000] },
      ],
      runs: [
        { label: '04:00', scores: [0.918, 0.930, 0.936, 0.945, 0.960, 1.000] },
        { label: '07:00', scores: [0.919, 0.932, 0.937, 0.946, 0.962, 1.000] },
        { label: '10:00', scores: [0.920, 0.933, 0.937, 0.948, 0.963, 1.000] },
        { label: '11:00', scores: [0.920, 0.934, 0.938, 0.948, 0.964, 1.000] },
        { label: '12:00', scores: [0.921, 0.935, 0.938, 0.949, 0.964, 1.000] },
      ],
    },
    hr: {
      id: 'hr', name: 'HR', system: 'HRIS',
      description: 'HRIS export — employees, managers, hire dates · Workday',
      refreshedAt: new Date().toISOString(),
      checks: [
        { dimension: 'Freshness',    field: 'last_updated', score: 0.872, issues: 67, total: 525, history: [0.880, 0.878, 0.875, 0.873, 0.872] },
        { dimension: 'Completeness', field: 'manager_id',   score: 0.928, issues: 38, total: 525, history: [0.922, 0.924, 0.926, 0.927, 0.928] },
        { dimension: 'Uniqueness',   field: 'email',        score: 0.952, issues: 25, total: 525, history: [0.948, 0.950, 0.951, 0.952, 0.952] },
        { dimension: 'Consistency',  field: 'hire_date',    score: 0.954, issues: 24, total: 525, history: [0.951, 0.953, 0.953, 0.954, 0.954] },
        { dimension: 'Validity',     field: 'email',        score: 0.975, issues: 13, total: 525, history: [0.971, 0.972, 0.974, 0.975, 0.975] },
      ],
      runs: [
        { label: '04:00', scores: [0.880, 0.922, 0.948, 0.951, 0.971] },
        { label: '07:00', scores: [0.878, 0.924, 0.950, 0.953, 0.972] },
        { label: '10:00', scores: [0.875, 0.926, 0.951, 0.953, 0.974] },
        { label: '11:00', scores: [0.873, 0.927, 0.952, 0.954, 0.975] },
        { label: '12:00', scores: [0.872, 0.928, 0.952, 0.954, 0.975] },
      ],
    },
  };

  const LINEAGE = {
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
    finance: {
      source: { id: 'finance', name: 'Finance', system: 'ERP' },
      checks: [
        { id: 'finance-completeness-currency',       label: 'completeness / currency',       score: 0.921, status: 'watch' },
        { id: 'finance-uniqueness-transaction_id',   label: 'uniqueness / transaction_id',   score: 0.935, status: 'watch' },
        { id: 'finance-completeness-cost_centre',    label: 'completeness / cost_centre',    score: 0.938, status: 'watch' },
        { id: 'finance-consistency-amount',          label: 'consistency / amount',          score: 0.949, status: 'watch' },
      ],
      downstream: [
        { id: 'ap-ledger',          name: 'AP Ledger',          kind: 'Ledger',    impactedBy: ['finance-completeness-currency', 'finance-uniqueness-transaction_id', 'finance-completeness-cost_centre'] },
        { id: 'board-finance-pack', name: 'Board Finance Pack', kind: 'Report',    impactedBy: ['finance-consistency-amount'] },
      ],
    },
    sales: {
      source: { id: 'sales', name: 'Sales', system: 'CRM' },
      checks: [
        { id: 'sales-freshness-created_date', label: 'freshness / created_date', score: 0.275, status: 'att' },
        { id: 'sales-uniqueness-email',       label: 'uniqueness / email',        score: 0.915, status: 'watch' },
        { id: 'sales-validity-stage',         label: 'validity / stage',          score: 0.937, status: 'watch' },
        { id: 'sales-consistency-close_date', label: 'consistency / close_date',  score: 0.945, status: 'watch' },
        { id: 'sales-consistency-revenue',    label: 'consistency / revenue',     score: 0.945, status: 'watch' },
      ],
      downstream: [
        { id: 'sales-forecast',   name: 'Sales Forecast',   kind: 'Dashboard', impactedBy: ['sales-freshness-created_date', 'sales-validity-stage', 'sales-consistency-close_date', 'sales-consistency-revenue'] },
        { id: 'revenue-dashboard',name: 'Revenue Dashboard', kind: 'Dashboard', impactedBy: ['sales-uniqueness-email'] },
      ],
    },
  };

  return makeDQ(SOURCES, LINEAGE);
}
