import { Sparkline } from './Viz.jsx'

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h > 24) return `${Math.floor(h / 24)}d ago`
  if (h > 0)  return `${h}h ago`
  return `${m}m ago`
}

export default function Overview({ dq, setRoute }) {
  const { SOURCES, SOURCE_ORDER, DIMENSIONS, INCIDENTS, dimensionFor, sourceSummary, topIssues, headlineStats } = dq
  const stats     = headlineStats()
  const issues    = topIssues()

  const now     = new Date()
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' UTC'
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="fade-in">
      <header className="screen-head">
        <div>
          <div className="screen-head__crumb">
            <span>Workspace</span>
            <span className="screen-head__crumb__sep">/</span>
            <span>Overview</span>
          </div>
          <h1 className="screen-head__title">
            Quality, across <em>{SOURCE_ORDER.length}</em> sources
          </h1>
          <p className="screen-head__subtitle">
            A live snapshot of every dimension on every connected source.
            Refreshes itself every minute — last sweep finished just now.
          </p>
        </div>
        <div className="screen-head__meta">
          <strong>{timeStr} · today</strong>
          <span>{dateStr}</span>
          <span style={{ marginTop: 6 }}>{stats.totalRows.toLocaleString()} rows scanned</span>
        </div>
      </header>

      {/* Business Impact Strip */}
      <div className="impact-strip">
        <div className="impact-strip__cell">
          <div className="impact-strip__label">Daily financial risk</div>
          <div className="impact-strip__value impact-strip__value--risk">
            £{stats.totalRisk.toLocaleString()}
          </div>
          <div className="impact-strip__sub">across <em>{SOURCE_ORDER.length} sources</em></div>
        </div>
        <div className="impact-strip__cell">
          <div className="impact-strip__label">Open incidents</div>
          <div className={'impact-strip__value' + (stats.openIncidents > 0 ? ' impact-strip__value--warning' : '')}>
            {stats.openIncidents}
          </div>
          <div className="impact-strip__sub">
            {stats.slaBreaches > 0
              ? `${stats.slaBreaches} SLA breach${stats.slaBreaches === 1 ? '' : 'es'} · escalated`
              : 'all within SLA'}
          </div>
        </div>
        <div className="impact-strip__cell">
          <div className="impact-strip__label">Rows flagged</div>
          <div className="impact-strip__value">{stats.totalIssues.toLocaleString()}</div>
          <div className="impact-strip__sub">across {stats.totalChecks} active checks</div>
        </div>
      </div>

      {/* Headline stats */}
      <div className="headline">
        <div className="headline__stat">
          <div className="headline__stat__label">Composite</div>
          <div className="headline__stat__value">
            <span>{(stats.avg * 100).toFixed(1)}</span>
            <span className="unit">%</span>
          </div>
          <div className="headline__stat__sub">
            <span className="delta delta--flat">— stable</span>
            <span>vs previous run</span>
          </div>
          <div className="headline__stat__spark">
            <Sparkline points={stats.composite} status="accent" width={84} height={28} />
          </div>
        </div>

        <div className="headline__stat">
          <div className="headline__stat__label">Need attention</div>
          <div className="headline__stat__value headline__stat__value--att">
            <span>{stats.attention}</span>
            <span className="unit">/ {stats.totalChecks}</span>
          </div>
          <div className="headline__stat__sub">
            <span>{stats.attention === 0 ? 'all clear' : `${stats.attention} check${stats.attention === 1 ? '' : 's'} flagged`}</span>
          </div>
        </div>

        <div className="headline__stat">
          <div className="headline__stat__label">Watching</div>
          <div className="headline__stat__value headline__stat__value--watch">
            <span>{stats.watching}</span>
            <span className="unit">/ {stats.totalChecks}</span>
          </div>
          <div className="headline__stat__sub">
            <span>across {SOURCE_ORDER.length} sources · trending stable</span>
          </div>
        </div>

        <div className="headline__stat">
          <div className="headline__stat__label">Rows flagged</div>
          <div className="headline__stat__value">
            <span>{stats.totalIssues.toLocaleString()}</span>
          </div>
          <div className="headline__stat__sub">
            <span>across all active checks</span>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <section className="section">
        <header className="section__head">
          <h2 className="section__title">Sources <em>×</em> Dimensions</h2>
          <div className="section__counter">{SOURCE_ORDER.length} sources · {DIMENSIONS.length} dimensions</div>
        </header>

        <div className="heatmap">
          <div className="heatmap__row heatmap__row--head">
            <div className="heatmap__cell">Source</div>
            {DIMENSIONS.map(d => <div key={d} className="heatmap__cell">{d}</div>)}
            <div className="heatmap__cell">Composite</div>
          </div>

          {SOURCE_ORDER.map(sid => {
            const src     = SOURCES[sid]
            const summary = sourceSummary(sid)
            return (
              <div key={sid} className="heatmap__row">
                <div className="heatmap__cell heatmap__cell--source" onClick={() => setRoute(sid)}>
                  <div className="src-name">{src.name}</div>
                  <div className="src-system">{src.system}</div>
                </div>

                {DIMENSIONS.map(dim => {
                  const check = dimensionFor(sid, dim)
                  if (!check) return (
                    <div key={dim} className="heatmap__cell">
                      <span className="cell-empty">—</span>
                    </div>
                  )
                  const status = dq.scoreStatus(check.score)
                  return (
                    <div key={dim} className="heatmap__cell heatmap__cell--data" onClick={() => setRoute(sid)}>
                      <span className={'cell-bar cell-bar--' + status} />
                      <span className={'cell-value cell-value--' + status}>
                        {(check.score * 100).toFixed(1)}<span className="pct">%</span>
                      </span>
                      <Sparkline points={check.history} status={status} width={120} height={16} />
                      <span className="cell-field">{check.field}</span>
                    </div>
                  )
                })}

                <div className="heatmap__cell heatmap__cell--summary" onClick={() => setRoute(sid)}>
                  <div className={'summary-score summary-score--' + summary.worst}>
                    {(summary.avg * 100).toFixed(1)}<span className="pct">%</span>
                  </div>
                  <div className="summary-breakdown">
                    {summary.counts.att   > 0 && <span className="b-fail"><strong>{summary.counts.att}</strong> attn</span>}
                    {summary.counts.watch > 0 && <span className="b-warn"><strong>{summary.counts.watch}</strong> watch</span>}
                    {summary.counts.good  > 0 && <span className="b-ok"><strong>{summary.counts.good}</strong> good</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Top issues */}
      <section className="section">
        <header className="section__head">
          <h2 className="section__title">What to look at <em>first</em></h2>
          <div className="section__counter">{issues.length} active checks · sorted ascending</div>
        </header>

        <div className="issues">
          {issues.map((iss, idx) => (
            <div key={idx} className="issue" onClick={() => setRoute(iss.sourceId)}>
              <span className="issue__rank">{String(idx + 1).padStart(2, '0')}</span>
              <span className="issue__source">
                <span className={'issue__source__bar issue__source__bar--' + iss.status} />
                {iss.source}
              </span>
              <span className="issue__dim">{iss.dimension}</span>
              <span className="issue__field">
                <span className="issue__field-prefix">·</span>
                {iss.field}
              </span>
              <span className="issue__viz">
                <span className="issue__viz__bar">
                  <span
                    className={'issue__viz__bar__fill issue__viz__bar__fill--' + iss.status}
                    style={{ width: (iss.score * 100) + '%' }}
                  />
                </span>
                <span className={'issue__score issue__score--' + iss.status}>
                  {(iss.score * 100).toFixed(1)}%
                </span>
              </span>
              <span className="issue__issues">
                <span className="issue__issues__count">{iss.issues.toLocaleString()}</span>
                <span style={{ color: 'var(--fg-faint)' }}> / {iss.total.toLocaleString()}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Incident feed */}
      {INCIDENTS && INCIDENTS.length > 0 && (
        <section className="section">
          <header className="section__head">
            <h2 className="section__title">Incident <em>feed</em></h2>
            <div className="section__counter">{stats.openIncidents} open · {INCIDENTS.length} total</div>
          </header>

          <div className="incidents">
            {INCIDENTS.map((inc, i) => (
              <div key={i} className="incident">
                <div>
                  <span className={'incident__sev incident__sev--' + inc.severity}>
                    {inc.severity}
                  </span>
                </div>

                <div className="incident__body">
                  <div className="incident__header">
                    <span className="incident__id">{inc.id}</span>
                    <span className="incident__title">{inc.title}</span>
                  </div>
                  <div className="incident__detail">{inc.detail}</div>
                  <div className="incident__meta">
                    <span>Owner: {inc.owner}</span>
                    <span>{timeAgo(inc.detectedAt)}</span>
                    {inc.affectedAssets.map((a, ai) => (
                      <span key={ai} style={{ opacity: 0.7 }}>{a}</span>
                    ))}
                  </div>
                </div>

                <div className="incident__side">
                  <span className={'incident__status incident__status--' + inc.status}>
                    {inc.status}
                  </span>
                  {inc.slaBreached && <span className="incident__sla-tag">SLA breached</span>}
                  <span className="incident__impact">{inc.impact}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
