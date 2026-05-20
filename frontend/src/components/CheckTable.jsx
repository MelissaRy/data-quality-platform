import Tag from './Tag'

function ScoreBar({ score }) {
  const color = score >= 0.95 ? '#10b981' : score >= 0.80 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden flex-shrink-0">
        <div className="h-full rounded-full transition-all" style={{ width: `${score * 100}%`, background: color }} />
      </div>
      <span className="text-gray-300 tabular-nums text-xs">{(score * 100).toFixed(1)}%</span>
    </div>
  )
}

export default function CheckTable({ checks }) {
  const sorted = [...checks].sort((a, b) => a.score - b.score)

  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/40">
            <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Dimension</th>
            <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Field</th>
            <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Score</th>
            <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Status</th>
            <th className="text-right px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Issues</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => (
            <tr key={i} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors">
              <td className="px-4 py-3 text-gray-300 capitalize">{c.dimension}</td>
              <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.field}</td>
              <td className="px-4 py-3"><ScoreBar score={c.score} /></td>
              <td className="px-4 py-3"><Tag tag={c.tag} /></td>
              <td className="px-4 py-3 text-right text-gray-400 tabular-nums text-xs">
                {c.issue_count.toLocaleString()} / {c.total_count.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
