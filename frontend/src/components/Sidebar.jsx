export default function Sidebar({ route, setRoute, dq, onOpenAssistant }) {
  const { SOURCES, sourceSummary } = dq

  const sources = ['sales', 'finance', 'hr'].map(id => ({
    id,
    name:    SOURCES[id].name,
    summary: sourceSummary(id),
  }))

  const dotClass = (status) => ({ att: 'fail', watch: 'warn', good: 'ok' }[status] || 'ok')

  const renderCount = (summary) => {
    if (summary.counts.att > 0)   return `${summary.counts.att} need${summary.counts.att === 1 ? 's' : ''} attn`
    if (summary.counts.watch > 0) return `${summary.counts.watch} watching`
    return 'all good'
  }

  const navItem = (id, label, opts = {}) => (
    <button
      key={id}
      className={'nav__item' + (route === id ? ' nav__item--active' : '')}
      onClick={() => setRoute(id)}
    >
      {opts.dot && <span className={'nav__item__dot nav__item__dot--' + opts.dot} />}
      <span>{label}</span>
      {opts.count != null && <span className="nav__item__count">{opts.count}</span>}
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__monogram">
          <div className="brand__mark">d</div>
          <span>Daylight</span>
        </div>
        <div className="brand__caption">Data quality · v2.4</div>
      </div>

      <nav className="nav">
        <div className="nav__group">Workspace</div>
        {navItem('overview', 'Overview')}

        <div className="nav__group" style={{ marginTop: 16 }}>Sources</div>
        {sources.map(src =>
          navItem(src.id, src.name, {
            dot:   dotClass(src.summary.worst),
            count: renderCount(src.summary),
          })
        )}

        <div className="nav__group" style={{ marginTop: 16 }}>Analysis</div>
        {navItem('lineage', 'Lineage & impact', { count: '3' })}
      </nav>

      <div className="sidebar__footer">
        <button className="assistant-trigger" onClick={onOpenAssistant}>
          <span className="assistant-trigger__icon">✦</span>
          <span>Ask the Assistant</span>
          <span className="assistant-trigger__kbd">⌘K</span>
        </button>
        <div className="refresh-status">
          <span className="refresh-status__pulse" />
          <span>Auto-refresh · 60s</span>
        </div>
      </div>
    </aside>
  )
}
