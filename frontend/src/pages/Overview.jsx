import { useQuery } from '@tanstack/react-query'
import * as client from '../api/client'
import SourceCard from '../components/SourceCard'
import Tag from '../components/Tag'

export default function Overview({ onSelectSource }) {
  const { data: sources, isLoading, error } = useQuery({
    queryKey: ['sources'],
    queryFn: client.getSources,
    refetchInterval: 60_000,
  })

  if (isLoading) return <div className="p-8 text-gray-500">Loading…</div>
  if (error)     return <div className="p-8 text-red-400">{error.message}</div>

  const sorted = [...sources].sort((a, b) => {
    const issues = s => s.checks.filter(c => c.tag !== 'OK').length
    return issues(b) - issues(a)
  })

  const failing = sources
    .flatMap(s => s.checks.map(c => ({ ...c, source: s.name })))
    .filter(c => c.tag !== 'OK')
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-xl font-semibold text-white mb-1">Overview</h1>
      <p className="text-gray-400 text-sm mb-7">Data quality across all sources · auto-refreshes every 60s</p>

      <div className="grid grid-cols-3 gap-4 mb-10">
        {sorted.map(s => (
          <SourceCard key={s.name} source={s} onClick={() => onSelectSource(s.name)} />
        ))}
      </div>

      {failing.length > 0 && (
        <>
          <h2 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-widest">Top Issues</h2>
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/40">
                  {['Source', 'Dimension', 'Field', 'Score', 'Issues'].map(h => (
                    <th key={h} className={`px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide ${h === 'Score' || h === 'Issues' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {failing.map((c, i) => (
                  <tr key={i} className="border-b border-gray-800/40 last:border-0 hover:bg-gray-800/20 transition-colors">
                    <td className="px-4 py-3 text-gray-300">{c.source}</td>
                    <td className="px-4 py-3 text-gray-300 capitalize">{c.dimension}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.field}</td>
                    <td className="px-4 py-3 text-right"><Tag tag={c.tag} /></td>
                    <td className="px-4 py-3 text-right text-gray-400 tabular-nums text-xs">
                      {c.issue_count.toLocaleString()} / {c.total_count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
