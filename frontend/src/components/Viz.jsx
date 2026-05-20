export function Sparkline({ points, status = 'neutral', width = 84, height = 28, padTop = 2, padBottom = 2 }) {
  if (!points || points.length === 0) return null
  const min    = Math.min(...points, 0.20)
  const max    = Math.max(...points, 1.0)
  const range  = Math.max(0.001, max - min)
  const stepX  = points.length > 1 ? width / (points.length - 1) : width
  const yFor   = (v) => padTop + (height - padTop - padBottom) * (1 - (v - min) / range)

  const stroke = { att: 'var(--att)', watch: 'var(--watch)', good: 'var(--good)', accent: 'var(--accent)', neutral: 'var(--fg-dim)' }[status] || 'var(--fg-dim)'
  const fill   = { att: 'var(--att-tint)', watch: 'var(--watch-tint)', good: 'var(--good-tint)', accent: 'var(--accent-tint)', neutral: 'var(--surface)' }[status] || 'var(--surface)'

  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)},${yFor(v).toFixed(2)}`).join(' ')
  const area = `${path} L${((points.length - 1) * stepX).toFixed(2)},${height} L0,${height} Z`

  return (
    <svg className="cell-spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} preserveAspectRatio="none">
      <path d={area} fill={fill} opacity="0.7" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(points.length - 1) * stepX} cy={yFor(points[points.length - 1])} r="2" fill={stroke} />
    </svg>
  )
}
