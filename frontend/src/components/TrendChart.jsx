import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export default function TrendChart({ runs }) {
  const keys = runs[0]?.metrics.map(m => `${m.dimension}/${m.field}`) ?? []

  const data = [...runs].reverse().map((r, i) => {
    const point = { label: `Run ${i + 1}` }
    r.metrics.forEach(m => { point[`${m.dimension}/${m.field}`] = m.score })
    return point
  })

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: -24, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis
            domain={[0, 1]}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickFormatter={v => `${(v * 100).toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={{ background: '#1a1d27', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={v => [`${(v * 100).toFixed(1)}%`]}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
          {keys.map((k, i) => (
            <Line
              key={k} type="monotone" dataKey={k}
              stroke={PALETTE[i % PALETTE.length]}
              dot={{ r: 3 }} strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
