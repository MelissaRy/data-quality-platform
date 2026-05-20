import { useState, useEffect } from 'react'
import { fetchDQ } from './dq.js'
import Sidebar    from './components/Sidebar.jsx'
import Overview   from './components/Overview.jsx'
import Source     from './components/Source.jsx'
import Lineage    from './components/Lineage.jsx'
import Assistant  from './components/Assistant.jsx'
import Tweaks     from './components/Tweaks.jsx'

export default function App() {
  const [dq, setDq]                   = useState(null)
  const [route, setRoute]             = useState('overview')
  const [assistantOpen, setAssistant] = useState(false)

  useEffect(() => {
    fetchDQ().then(setDq)
  }, [])

  // Hash-based routing — accepts any value, screen switch handles unknown routes
  useEffect(() => {
    const fromHash = () => {
      const h = (window.location.hash || '').replace(/^#\/?/, '') || 'overview'
      setRoute(h || 'overview')
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [])

  useEffect(() => {
    window.location.hash = '/' + route
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [route])

  // Cmd/Ctrl+K to open assistant
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setAssistant(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!dq) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
          Loading…
        </div>
      </div>
    )
  }

  const screen = (() => {
    if (route === 'overview') return <Overview dq={dq} setRoute={setRoute} key="ov" />
    if (route === 'lineage')  return <Lineage  dq={dq} key="ln" />
    if (dq.SOURCES[route])   return <Source   dq={dq} sourceId={route} key={route} />
    return <Overview dq={dq} setRoute={setRoute} key="ov-fallback" />
  })()

  return (
    <div className="app">
      <Sidebar route={route} setRoute={setRoute} dq={dq} onOpenAssistant={() => setAssistant(true)} />
      <main className="main">{screen}</main>
      <Assistant open={assistantOpen} onClose={() => setAssistant(false)} dq={dq} />
      <Tweaks />
    </div>
  )
}
