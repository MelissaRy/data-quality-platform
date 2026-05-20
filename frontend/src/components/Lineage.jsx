import { useState } from 'react'

function LineageGraph({ data }) {
  const SRC_W = 140, SRC_H = 80
  const CHK_W = 180, CHK_H = 76
  const DSN_W = 180, DSN_H = 72
  const COL_X = { src: 100, chk: 380, dsn: 700 }
  const W = 920, H = 560

  const { checks, downstream } = data

  const yFor = (i, total, height) => {
    const totalHeight = total * height + (total - 1) * 32
    const startY = 280 - totalHeight / 2
    return startY + i * (height + 32)
  }
  const checkY = (i) => yFor(i, checks.length, CHK_H)
  const dsnY   = (i) => yFor(i, downstream.length, DSN_H)
  const srcY   = 240

  const edges = []
  checks.forEach((c, i) => {
    edges.push({
      from: { x: COL_X.src + SRC_W, y: srcY + SRC_H / 2 },
      to:   { x: COL_X.chk,         y: checkY(i) + CHK_H / 2 },
      status: 'neutral', animated: false,
    })
  })
  downstream.forEach((d, di) => {
    d.impactedBy.forEach(checkId => {
      const ci = checks.findIndex(c => c.id === checkId)
      if (ci >= 0) {
        edges.push({
          from: { x: COL_X.chk + CHK_W, y: checkY(ci) + CHK_H / 2 },
          to:   { x: COL_X.dsn,         y: dsnY(di) + DSN_H / 2 },
          status: checks[ci].status,
          animated: checks[ci].status === 'att',
        })
      }
    })
  })

  const edgePath = (from, to) => {
    const dx  = to.x - from.x
    const c1x = from.x + dx * 0.55
    const c2x = to.x   - dx * 0.55
    return `M${from.x},${from.y} C${c1x},${from.y} ${c2x},${to.y} ${to.x},${to.y}`
  }

  return (
    <svg className="graph__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {edges.map((e, i) => (
        <path
          key={i}
          d={edgePath(e.from, e.to)}
          className={'graph-edge graph-edge--' + e.status + (e.animated ? ' graph-edge--animated' : '')}
        />
      ))}

      <g className="graph-node graph-node--source" transform={`translate(${COL_X.src}, ${srcY})`}>
        <rect className="graph-node__bg" x="0" y="0" width={SRC_W} height={SRC_H} rx="14" />
        <text className="graph-node__title" x={SRC_W / 2} y={SRC_H / 2 - 8}>{data.source.name}</text>
        <text className="graph-node__sub"   x={SRC_W / 2} y={SRC_H / 2 + 16}>{data.source.system}</text>
      </g>

      {checks.map((c, i) => (
        <g
          key={c.id}
          className={'graph-node graph-node--check graph-node--' + (c.status === 'att' ? 'fail' : c.status === 'watch' ? 'warn' : 'ok')}
          transform={`translate(${COL_X.chk}, ${checkY(i)})`}
        >
          <rect className="graph-node__bg" x="0" y="0" width={CHK_W} height={CHK_H} rx="12" />
          <text className="graph-node__sub"   x={CHK_W / 2} y={20}>{c.label.split(' / ')[0]}</text>
          <text x={CHK_W / 2} y={42} fontFamily="var(--font-mono)" fontSize="12" fill="var(--fg)" textAnchor="middle">
            {c.label.split(' / ')[1]}
          </text>
          <text className={'graph-node__value graph-node__value--' + c.status} x={CHK_W / 2} y={62}>
            {(c.score * 100).toFixed(1)}%
          </text>
        </g>
      ))}

      {downstream.map((d, i) => (
        <g key={d.id} className="graph-node" transform={`translate(${COL_X.dsn}, ${dsnY(i)})`}>
          <rect className="graph-node__bg" x="0" y="0" width={DSN_W} height={DSN_H} rx="12" />
          <text className="graph-node__sub"   x={DSN_W / 2} y={22}>{d.kind}</text>
          <text className="graph-node__title" x={DSN_W / 2} y={DSN_H / 2 + 12}>{d.name}</text>
        </g>
      ))}
    </svg>
  )
}

export default function Lineage({ dq }) {
  const { LINEAGE } = dq
  const [active, setActive] = useState(Object.keys(LINEAGE)[0] || 'sales')
  const data = LINEAGE[active]

  const dotFor = (id) => {
    const checks = LINEAGE[id]?.checks || []
    if (checks.some(c => c.status === 'att'))   return 'fail'
    if (checks.some(c => c.status === 'watch')) return 'warn'
    return 'ok'
  }

  const failingCount  = data.checks.filter(c => c.status === 'att').length
  const watchingCount = data.checks.filter(c => c.status === 'watch').length
  const totalDown     = Object.values(LINEAGE).reduce((s, l) => s + l.downstream.length, 0)
  const totalChecks   = Object.values(LINEAGE).reduce((s, l) => s + l.checks.length, 0)

  return (
    <div className="fade-in">
      <header className="screen-head">
        <div>
          <div className="screen-head__crumb">
            <span>Analysis</span>
            <span className="screen-head__crumb__sep">/</span>
            <span>Lineage</span>
          </div>
          <h1 className="screen-head__title">Lineage <em>&amp;</em> blast radius</h1>
          <p className="screen-head__subtitle">
            Where each failing check flows. Animated edges trace the path of an issue that needs attention.
          </p>
        </div>
        <div className="screen-head__meta">
          <strong>{Object.keys(LINEAGE).length} sources mapped</strong>
          <span>{totalDown} downstream assets · {totalChecks} active checks</span>
        </div>
      </header>

      <div className="lineage-head-meta">
        <div className="lineage-tabs" role="tablist">
          {Object.keys(LINEAGE).map(id => (
            <button
              key={id}
              role="tab"
              className={'lineage-tab' + (active === id ? ' lineage-tab--active' : '')}
              onClick={() => setActive(id)}
            >
              <span className={'lineage-tab__dot lineage-tab__dot--' + dotFor(id)} />
              <span>{LINEAGE[id].source.name}</span>
            </button>
          ))}
        </div>
        <div className="lineage-meta">
          {failingCount > 0 && <span><strong>{failingCount} check{failingCount === 1 ? '' : 's'}</strong> needing attention</span>}
          {watchingCount > 0 && <span>{watchingCount} being watched</span>}
          <span>{data.downstream.length} downstream assets</span>
        </div>
      </div>

      <div className="graph">
        <div className="graph__summary">
          {failingCount > 0
            ? <><span>Tracing </span><strong>{failingCount} failing check{failingCount === 1 ? '' : 's'}</strong><span> through {data.downstream.length} downstream assets</span></>
            : <>Tracing {data.checks.length} active checks through {data.downstream.length} downstream assets</>}
        </div>

        <div className="graph__legend">
          <div className="graph__legend__title">Edge legend</div>
          <div className="graph__legend__item"><span className="graph__legend__line graph__legend__line--fail" /><span>needs attention</span></div>
          <div className="graph__legend__item"><span className="graph__legend__line graph__legend__line--warn" /><span>watching</span></div>
          <div className="graph__legend__item"><span className="graph__legend__line graph__legend__line--neutral" /><span>upstream link</span></div>
        </div>

        <div className="graph__controls">
          <button className="graph__control" aria-label="Zoom in">+</button>
          <button className="graph__control" aria-label="Zoom out">−</button>
          <button className="graph__control" aria-label="Fit">⛶</button>
        </div>

        <LineageGraph data={data} />
      </div>
    </div>
  )
}
