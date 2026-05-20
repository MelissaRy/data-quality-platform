import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as client from '../api/client'
import LineageGraph from '../components/LineageGraph'

const SOURCES = ['HR', 'Finance', 'Sales']

export default function Lineage() {
  const [active, setActive] = useState('HR')

  const { data, isLoading } = useQuery({
    queryKey: ['lineage', active],
    queryFn: () => client.getLineage(active),
  })

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-xl font-semibold text-white mb-1">Lineage & Blast Radius</h1>
      <p className="text-gray-400 text-sm mb-7">
        Failing checks and the downstream assets they impact
      </p>

      <div className="flex gap-1 mb-6">
        {SOURCES.map(s => (
          <button
            key={s}
            onClick={() => setActive(s)}
            className={`px-4 py-1.5 rounded-lg text-sm transition-all border ${
              active === s
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                : 'text-gray-400 hover:text-gray-200 border-transparent hover:border-gray-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-gray-500">Loading…</div>
      ) : !data?.failing_checks?.length ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-emerald-400 text-sm">
          No failing checks for {active} ✓
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-3">
            {data.failing_checks.length} failing check{data.failing_checks.length > 1 ? 's' : ''} · animated edges = FAIL
          </p>
          <LineageGraph source={active} checks={data.failing_checks} />
        </>
      )}
    </div>
  )
}
