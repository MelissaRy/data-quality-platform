import Tag from './Tag'

export default function SourceCard({ source, onClick }) {
  const counts = { OK: 0, WARN: 0, FAIL: 0 }
  source.checks.forEach(c => { counts[c.tag] = (counts[c.tag] ?? 0) + 1 })

  const worstScore = Math.min(...source.checks.map(c => c.score))
  const overallTag = worstScore < 0.80 ? 'FAIL' : worstScore < 0.95 ? 'WARN' : 'OK'

  const borderCls = {
    OK:   'border-emerald-500/30 hover:border-emerald-500/50',
    WARN: 'border-amber-500/30  hover:border-amber-500/50',
    FAIL: 'border-red-500/30    hover:border-red-500/50',
  }[overallTag]

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border bg-gray-900/60 p-5 transition-all hover:bg-gray-800/60 ${borderCls}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="font-semibold text-white text-base">{source.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{source.system_type}</p>
        </div>
        <Tag tag={overallTag} />
      </div>

      <div className="space-y-1.5 mb-4">
        {[...source.checks].sort((a, b) => a.score - b.score).slice(0, 3).map((c, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{c.dimension} / {c.field}</span>
            <span className={c.tag === 'FAIL' ? 'text-red-400' : c.tag === 'WARN' ? 'text-amber-400' : 'text-emerald-400'}>
              {(c.score * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 text-xs pt-3 border-t border-gray-800">
        {counts.FAIL > 0 && <span className="text-red-400">{counts.FAIL} fail</span>}
        {counts.WARN > 0 && <span className="text-amber-400">{counts.WARN} warn</span>}
        {counts.OK   > 0 && <span className="text-emerald-400">{counts.OK} ok</span>}
      </div>
    </button>
  )
}
