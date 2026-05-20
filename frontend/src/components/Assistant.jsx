import { useState, useRef, useEffect } from 'react'

const SEED_MESSAGES = [
  {
    from: 'ai',
    body: 'Good morning. Quick read on the latest sweep: Sales · freshness on created_date is at 27.5% — that\'s the one to look at first. Everything else is in the 87–100% band.',
  },
]

const SUGGESTIONS = [
  'What broke the Sales freshness check?',
  'Show me checks that got worse this week',
  'Which dashboards depend on the failing Sales check?',
  'Draft a Slack message for the data on-call',
]

export default function Assistant({ open, onClose, dq }) {
  const [messages, setMessages] = useState(SEED_MESSAGES)
  const [apiHistory, setApiHistory] = useState([])
  const [draft, setDraft]   = useState('')
  const [busy, setBusy]     = useState(false)
  const bodyRef             = useRef(null)

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages, busy])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const send = async (text) => {
    if (!text.trim() || busy) return

    const userMsg  = { from: 'user', body: text }
    const nextHist = [...apiHistory, { role: 'user', content: text }]

    setMessages(m => [...m, userMsg, { from: 'ai', body: '' }])
    setApiHistory(nextHist)
    setDraft('')
    setBusy(true)

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: nextHist }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let buf      = ''
      let reply    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          try {
            const { content } = JSON.parse(payload)
            reply += content
            setMessages(prev => {
              const next = [...prev]
              next[next.length - 1] = { from: 'ai', body: reply }
              return next
            })
          } catch { /* partial chunk */ }
        }
      }

      setApiHistory(h => [...h, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { from: 'ai', body: "Something went sideways — I couldn't reach the model. Try again in a moment." }
        return next
      })
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) }
  }

  return (
    <>
      <div
        className={'assistant__scrim' + (open ? ' assistant__scrim--open' : '')}
        onClick={onClose}
      />
      <aside className={'assistant' + (open ? ' assistant--open' : '')}>
        <header className="assistant__head">
          <div className="assistant__title">
            <div className="assistant__title__icon">✦</div>
            <div>
              <div className="assistant__title__text">Assistant</div>
              <div className="assistant__title__sub">aware of your sources</div>
            </div>
          </div>
          <button className="assistant__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="assistant__body" ref={bodyRef}>
          {messages.map((m, i) => (
            <div key={i} className={'assistant__msg assistant__msg--' + m.from}>
              <div className={'assistant__msg__from assistant__msg__from--' + m.from}>
                {m.from === 'ai' ? '✦ Daylight' : 'You'}
              </div>
              <div className="assistant__msg__body">
                {m.body || (m.from === 'ai' && busy && i === messages.length - 1
                  ? <span style={{ color: 'var(--fg-dim)' }}>thinking…</span>
                  : m.body)}
              </div>
            </div>
          ))}
          {busy && messages[messages.length - 1]?.body === '' && (
            <span />
          )}
        </div>

        {!busy && messages.length < 4 && (
          <div className="assistant__suggestions">
            <div className="assistant__suggestions__label">Try asking</div>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} className="assistant__suggestion" onClick={() => send(s)}>
                <span className="assistant__suggestion__icon">→</span>
                <span>{s}</span>
              </button>
            ))}
          </div>
        )}

        <div className="assistant__input">
          <textarea
            className="assistant__input__field"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything about your data quality…"
            rows={1}
          />
          <div className="assistant__input__hint">
            <span>↩ to send · ⇧↩ for newline · 20 msg limit</span>
            <span>Powered by Claude</span>
          </div>
        </div>
      </aside>
    </>
  )
}
