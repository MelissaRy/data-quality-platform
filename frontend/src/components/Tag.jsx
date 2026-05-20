const STYLES = {
  OK:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  WARN: 'bg-amber-500/10  text-amber-400  border-amber-500/20',
  FAIL: 'bg-red-500/10    text-red-400    border-red-500/20',
}

export default function Tag({ tag }) {
  return (
    <span className={`inline-block border rounded px-1.5 py-0.5 text-xs font-medium ${STYLES[tag] ?? ''}`}>
      {tag}
    </span>
  )
}
