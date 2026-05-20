import { useQuery } from '@tanstack/react-query'
import * as client from '../api/client'
import CheckTable from '../components/CheckTable'
import TrendChart from '../components/TrendChart'

export default function SourceDetail({ source }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['source', source],
    queryFn: () => client.getSource(source),
  })
  const { data: runs } = useQuery({
    queryKey: ['runs', source],
    queryFn: () => client.getRuns(source),
  })

  if (isLoading) return <div className="p-8 text-gray-500">Loading…</div>

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-xl font-semibold text-white mb-1">{source}</h1>
      <p className="text-gray-400 text-sm mb-7">
        {detail?.system_type} · {detail?.description}
      </p>

      <h2 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-widest">Quality Checks</h2>
      <CheckTable checks={detail?.checks ?? []} />

      {runs && runs.length > 1 && (
        <div className="mt-8">
          <h2 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-widest">
            Score Trend · {runs.length} runs
          </h2>
          <TrendChart runs={runs} />
        </div>
      )}
    </div>
  )
}
