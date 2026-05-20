import { useState } from 'react'
import Overview from './pages/Overview'
import SourceDetail from './pages/SourceDetail'
import Lineage from './pages/Lineage'
import ChatPanel from './components/ChatPanel'

const NAV = [
  { id: 'overview',       label: 'Overview' },
  { id: 'source:HR',      label: 'HR' },
  { id: 'source:Finance', label: 'Finance' },
  { id: 'source:Sales',   label: 'Sales' },
  { id: 'lineage',        label: 'Lineage' },
]

export default function App() {
  const [page, setPage] = useState('overview')
  const [chatOpen, setChatOpen] = useState(false)

  function renderPage() {
    if (page === 'overview') return <Overview onSelectSource={s => setPage(`source:${s}`)} />
    if (page.startsWith('source:')) return <SourceDetail source={page.split(':')[1]} />
    if (page === 'lineage') return <Lineage />
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0f1117' }}>
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 flex flex-col border-r border-gray-800" style={{ background: '#080a0f' }}>
        <div className="px-5 py-5 border-b border-gray-800">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">Data Quality</p>
          <p className="text-white font-semibold text-sm mt-0.5">Observability</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                page === item.id
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-800">
          <button
            onClick={() => setChatOpen(o => !o)}
            className={`w-full px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
              chatOpen
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
            }`}
          >
            <span>✦</span> AI Assistant
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {renderPage()}
      </main>

      {/* Chat panel */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
    </div>
  )
}
