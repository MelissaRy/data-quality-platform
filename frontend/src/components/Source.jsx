import { useState } from 'react'

const TREND_COLORS = [
  'oklch(0.62 0.135 45)',
  'oklch(0.58 0.105 155)',
  'oklch(0.53 0.120 340)',
  'oklch(0.56 0.135 275)',
  'oklch(0.65 0.140 200)',
  'oklch(0.70 0.140 65)',
]

function TrendChart({ runs, checks }) {
  const W = 720, H = 240
  const PAD_L = 44, PAD_R = 24, PAD_T = 20, PAD_B = 36
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const xFor = (i) => PAD_L + innerW * (i / Math.max(1, runs.length - 1))
  const yFor = (v) => PAD_T + innerH * (1 - v)
  const yTicks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <svg className="trend__chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <rect x={PAD_L} y={yFor(1)}    width={innerW} height={yFor(0.95) - yFor(1)}    fill="var(--good-tint)"  opacity="0.5" />
      <rect x={PAD_L} y={yFor(0.95)} width={innerW} height={yFor(0.50) - yFor(0.95)} fill="var(--watch-tint)" opacity="0.4" />
      <rect x={PAD_L} y={yFor(0.50)} width={innerW} height={yFor(0)    - yFor(0.50)} fill="var(--att-tint)"   opacity="0.5" />

      {yTicks.map(t => (
        <g key={t}>
          <line x1={PAD_L} x2={W - PAD_R} y1={yFor(t)} y2={yFor(t)} stroke="var(--line)" strokeDasharray={t === 0 || t === 1 ? '0' : '2 4'} />
          <text x={PAD_L - 10} y={yFor(t)} fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-dim)" textAnchor="end" dominantBaseline="central">
            {(t * 100).toFixed(0)}%
          </text>
        </g>
      ))}

      {runs.map((r, i) => (
        <text key={i} x={xFor(i)} y={H - PAD_B + 18} fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-dim)" textAnchor="middle">
          {r.label}
        </text>
      ))}

      {checks.map((chk, idx) => {
        const color  = TREND_COLORS[idx % TREND_COLORS.length]
        const points = runs.map((r, i) => ({ x: xFor(i), y: yFor(r.scores[idx] ?? chk.score) }))
        const path   = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        return (
          <g key={idx}>
            <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="var(--bg-elev)" stroke={color} strokeWidth="1.6" />)}
          </g>
        )
      })}
    </svg>
  )
}

function DistChart({ checks, scoreStatus }) {
  const W = 720, H = 120
  const PAD_L = 40, PAD_R = 40, PAD_T = 30, PAD_B = 30
  const innerW = W - PAD_L - PAD_R
  const axisY  = H - PAD_B
  const xFor   = (v) => PAD_L + innerW * v

  return (
    <svg className="trend__chart" style={{ height: 120 }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <rect x={xFor(0)}    y={axisY - 14} width={xFor(0.80) - xFor(0)}    height={14} fill="var(--att-tint)" />
      <rect x={xFor(0.80)} y={axisY - 14} width={xFor(0.95) - xFor(0.80)} height={14} fill="var(--watch-tint)" />
      <rect x={xFor(0.95)} y={axisY - 14} width={xFor(1)    - xFor(0.95)} height={14} fill="var(--good-tint)" />
      <line x1={xFor(0)} x2={xFor(1)} y1={axisY} y2={axisY} stroke="var(--line)" strokeWidth="1" />

      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <g key={t}>
          <line x1={xFor(t)} x2={xFor(t)} y1={axisY} y2={axisY + 4} stroke="var(--line-strong)" />
          <text x={xFor(t)} y={axisY + 18} fontFamily="var(--font-mono)" fontSize="10" fill="var(--fg-dim)" textAnchor="middle">
            {(t * 100).toFixed(0)}%
          </text>
        </g>
      ))}

      <text x={xFor(0.80)} y={axisY - 20} fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-faint)" textAnchor="middle" letterSpacing="0.1em">80</text>
      <text x={xFor(0.95)} y={axisY - 20} fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-faint)" textAnchor="middle" letterSpacing="0.1em">95</text>

      {checks.map((chk, idx) => {
        const status = scoreStatus(chk.score)
        const color  = { att: 'var(--att)', watch: 'var(--watch)', good: 'var(--good)' }[status]
        const x      = xFor(chk.score)
        const yTop   = PAD_T + 4
        return (
          <g key={idx}>
            <line x1={x} x2={x} y1={yTop} y2={axisY - 1} stroke={color} strokeWidth="1.2" />
            <circle cx={x} cy={yTop} r="5" fill="var(--bg-elev)" stroke={color} strokeWidth="1.8" />
            <text x={x} y={yTop - 8} fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-mute)" textAnchor="middle" letterSpacing="0.04em">
              {chk.dimension.slice(0, 3).toUpperCase()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function complianceTag(risk) {
  if (!risk) return null
  return risk.split(' — ')[0]
}

function changeVerb(change) {
  if (!change) return 'changed'
  if (change.toLowerCase().startsWith('type changed')) return 'type_changed'
  return change.toLowerCase().split(' ')[0]
}

export default function Source({ dq, sourceId }) {
  const [expandedIdx, setExpandedIdx] = useState(null)
  const { SOURCES, scoreStatus, sourceSummary, STATUS_LABEL } = dq
  const src             = SOURCES[sourceId]
  const summary         = sourceSummary(sourceId)
  const composite       = summary.avg
  const compositeStatus = scoreStatus(composite)

  const toggleExpand = (idx) =>
    setExpandedIdx(e => e === idx ? null : idx)

  const impact = src.businessImpact

  return (
    <div className="fade-in">
      <header className="screen-head">
        <div>
          <div className="screen-head__crumb">
            <span>Sources</span>
            <span className="screen-head__crumb__sep">/</span>
            <span>{src.system}</span>
            <span className="screen-head__crumb__sep">/</span>
            <span>{src.name}</span>
          </div>
          <h1 className="screen-head__title">{src.name}, <em>looking</em> at every field</h1>
          <p className="screen-head__subtitle">{src.description}</p>
        </div>
        <div className="screen-head__meta">
          <strong>Last run · just now</strong>
          <span>{src.checks.length} checks · {src.runs.length} historical runs</span>
          {src.table && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.6 }}>{src.table}</span>}
        </div>
      </header>

      {/* Business Impact Card */}
      {impact && impact.dailyRisk > 0 && (
        <div className="impact-card">
          <div className="impact-card__main">
            <div className="impact-card__label">Daily financial risk</div>
            <div className="impact-card__value">
              {impact.currency}{impact.dailyRisk.toLocaleString()}
            </div>
          </div>
          <div className="impact-card__detail">{impact.description}</div>
          <div className="impact-card__reports">
            <strong>{impact.affectedReports}</strong>
            <span>affected reports</span>
          </div>
        </div>
      )}

      {/* Source meta strip */}
      <div className="source-meta">
        <div className="source-meta__cell">
          <div className="source-meta__label">Composite score</div>
          <div className={'source-meta__value source-meta__value--' + compositeStatus}>
            {(composite * 100).toFixed(1)}<span className="unit">%</span>
          </div>
          <div className="source-meta__sub">across {src.checks.length} dimensions · {STATUS_LABEL[compositeStatus].toLowerCase()}</div>
          <div className="source-meta__gauge">
            <div className={'source-meta__gauge__fill source-meta__gauge__fill--' + compositeStatus} style={{ width: (composite * 100) + '%' }} />
          </div>
        </div>
        <div className="source-meta__cell">
          <div className="source-meta__label">Need attention</div>
          <div className="source-meta__value source-meta__value--att">{summary.counts.att}</div>
          <div className="source-meta__sub">below 80%</div>
        </div>
        <div className="source-meta__cell">
          <div className="source-meta__label">Watching</div>
          <div className="source-meta__value source-meta__value--watch">{summary.counts.watch}</div>
          <div className="source-meta__sub">80 — 95%</div>
        </div>
        <div className="source-meta__cell">
          <div className="source-meta__label">Looking good</div>
          <div className="source-meta__value source-meta__value--good">{summary.counts.good}</div>
          <div className="source-meta__sub">at or above 95%</div>
        </div>
      </div>

      {/* Distribution */}
      <section className="section">
        <header className="section__head">
          <h2 className="section__title">Where each check <em>sits</em></h2>
          <div className="section__counter">distribution by score</div>
        </header>
        <div className="trend">
          <DistChart checks={src.checks} scoreStatus={scoreStatus} />
          <div className="trend__legend">
            <div className="trend__legend__item"><span className="trend__legend__swatch" style={{ background: 'var(--att)' }} /><span>below 80% — needs attention</span></div>
            <div className="trend__legend__item"><span className="trend__legend__swatch" style={{ background: 'var(--watch)' }} /><span>80 — 95% — watching</span></div>
            <div className="trend__legend__item"><span className="trend__legend__swatch" style={{ background: 'var(--good)' }} /><span>at or above 95% — looking good</span></div>
          </div>
        </div>
      </section>

      {/* Schema drift events */}
      {src.schemaEvents && src.schemaEvents.length > 0 && (
        <section className="section">
          <header className="section__head">
            <h2 className="section__title">Schema <em>drift</em></h2>
            <div className="section__counter">{src.schemaEvents.length} event{src.schemaEvents.length === 1 ? '' : 's'} detected</div>
          </header>
          <div className="schema-events">
            {src.schemaEvents.map((evt, i) => (
              <div key={i} className="schema-event">
                <span className={'schema-event__type schema-event__type--' + changeVerb(evt.change)}>
                  {changeVerb(evt.change).replace('_', ' ')}
                </span>
                <code className="schema-event__column">{evt.column}</code>
                <span className="schema-event__note">{evt.note}</span>
                <span className="schema-event__meta">{evt.detectedAt}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quality checks */}
      <section className="section">
        <header className="section__head">
          <h2 className="section__title">Quality checks</h2>
          <div className="section__counter">sorted by score · ascending · click to expand</div>
        </header>
        <div className="checks">
          {src.checks.map((chk, idx) => {
            const status    = scoreStatus(chk.score)
            const fillWidth = Math.min(100, chk.score * 100)
            const expanded  = expandedIdx === idx
            const tag       = complianceTag(chk.complianceRisk)
            const isPCI     = chk.complianceRisk?.startsWith('PCI')
            const hasSamples = chk.samples && chk.samples.length > 0
            const sampleKeys = hasSamples ? Object.keys(chk.samples[0]) : []

            return (
              <div key={idx} className="check-wrap">
                <div className="check" onClick={() => toggleExpand(idx)}>
                  <span className={'check__bar check__bar--' + status} />
                  <div className="check__dim">
                    <div className="check__dim__name">{chk.dimension}</div>
                    <div className={'check__dim__status check__dim__status--' + status}>{STATUS_LABEL[status]}</div>
                    {tag && (
                      <div className={'check__compliance' + (isPCI ? ' check__compliance--pci' : '')}>
                        ⚠ {tag}
                      </div>
                    )}
                  </div>
                  <div className="check__field">
                    <span className="check__field__label">Field</span>
                    <span className="check__field__name">{chk.field}</span>
                  </div>
                  <div className="check__viz">
                    <div className="check__viz__bar">
                      <div className={'check__viz__bar__fill check__viz__bar__fill--' + status} style={{ width: fillWidth + '%' }} />
                      <div className="check__viz__bar__threshold" style={{ left: '80%' }} />
                      <div className="check__viz__bar__threshold" style={{ left: '95%' }} />
                    </div>
                    <div className="check__viz__legend">
                      <span>0%</span><span>80</span><span>95</span><span>100%</span>
                    </div>
                  </div>
                  <div className={'check__score check__score--' + status}>
                    {(chk.score * 100).toFixed(1)}<span className="pct">%</span>
                  </div>
                  <div className="check__issues">
                    <strong>{chk.issues.toLocaleString()}</strong>
                    <span>of {chk.total.toLocaleString()} rows</span>
                    <div className="check__toggle-hint">
                      <span className={'check__toggle-hint__arrow' + (expanded ? ' check__toggle-hint__arrow--open' : '')}>▶</span>
                      <span>{expanded ? 'collapse' : 'expand'}</span>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="check-expansion">
                    {chk.complianceRisk && (
                      <div className={'check-expansion__compliance' + (isPCI ? ' check-expansion__compliance--pci' : '')}>
                        ⚠ {chk.complianceRisk}
                      </div>
                    )}
                    {chk.businessImpact && (
                      <div className="check-expansion__biz">
                        <strong>Impact</strong>{chk.businessImpact}
                      </div>
                    )}
                    {hasSamples && (
                      <div>
                        <div className="check-expansion__samples-head">Sample failing rows</div>
                        <table className="check-expansion__table">
                          <thead>
                            <tr>{sampleKeys.map(k => <th key={k}>{k}</th>)}</tr>
                          </thead>
                          <tbody>
                            {chk.samples.map((row, ri) => (
                              <tr key={ri}>
                                {sampleKeys.map(k => (
                                  <td key={k} title={String(row[k])}>
                                    {row[k] === null ? <em style={{ opacity: 0.4 }}>null</em> : String(row[k])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Score trend */}
      <section className="section">
        <header className="section__head">
          <h2 className="section__title">How it's <em>moved</em></h2>
          <div className="section__counter">past {src.runs.length} runs</div>
        </header>
        <div className="trend">
          <div className="trend__head">
            <div className="trend__title">Score trend</div>
            <div className="trend__meta">{src.runs.length} runs · {src.checks.length} series</div>
          </div>
          <TrendChart runs={src.runs} checks={src.checks} />
          <div className="trend__legend">
            {src.checks.map((chk, idx) => (
              <div key={idx} className="trend__legend__item">
                <span className="trend__legend__swatch" style={{ background: TREND_COLORS[idx % TREND_COLORS.length] }} />
                <span>{chk.dimension.toLowerCase()} / {chk.field}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
