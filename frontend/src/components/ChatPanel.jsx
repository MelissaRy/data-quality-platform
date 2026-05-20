import { useState, useRef, useEffect } from 'react'

const BASE = import.meta.env.VITE_API_URL ?? ''

export default function ChatPanel({ onClose }) {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: "Hi! I can help you understand the data quality issues across HR, Finance, and Sales. What would you like to know?",
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')

    const history = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setLoading(true)

    try {
      const res = await fetch(`${BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''

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
            setMessages(prev => {
              const next = [...prev]
              next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + content }
              return next
            })
          } catch { /* partial chunk */ }
        }
      }
    } catch {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong.' }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <aside className="w-80 flex-shrink-0 flex flex-col border-l border-gray-800" style={{ background: '#080a0f' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <p className="text-sm font-medium text-gray-100">AI Assistant</p>
          <p className="text-xs text-gray-500">Claude Haiku 4.5</p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none px-1">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[88%] rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-indigo-500/25 text-indigo-100'
                : 'bg-gray-800/80 text-gray-200'
            }`}>
              {m.content
                ? m.content
                : <span className="inline-flex gap-1 text-gray-500"><span className="animate-bounce" style={{animationDelay:'0ms'}}>●</span><span className="animate-bounce" style={{animationDelay:'150ms'}}>●</span><span className="animate-bounce" style={{animationDelay:'300ms'}}>●</span></span>
              }
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 pb-4 pt-2 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask about data quality…"
            disabled={loading}
            className="flex-1 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none border border-gray-700 focus:border-indigo-500/60 transition-colors"
            style={{ background: '#1a1d27' }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-30 transition-all hover:opacity-90"
            style={{ background: '#6366f1' }}
          >
            →
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2 text-center">20 messages per session · Claude Haiku 4.5</p>
      </div>
    </aside>
  )
}
