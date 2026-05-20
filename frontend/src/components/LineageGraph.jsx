import ReactFlow, { Background, Controls } from 'reactflow'
import 'reactflow/dist/style.css'

const TAG_STYLE = {
  FAIL: { background: '#2d0a0a', border: '1px solid #ef4444', color: '#fca5a5' },
  WARN: { background: '#2d1a03', border: '1px solid #f59e0b', color: '#fcd34d' },
}

function buildGraph(source, checks) {
  const nodes = []
  const edges = []
  const assetIds = {}

  nodes.push({
    id: 'src',
    data: { label: source },
    position: { x: 0, y: Math.max(0, (checks.length - 1) * 50) },
    style: {
      background: '#1e1b4b', border: '1px solid #6366f1', color: '#a5b4fc',
      borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600,
      minWidth: 100, textAlign: 'center',
    },
  })

  checks.forEach((c, i) => {
    const cid = `c${i}`
    const style = TAG_STYLE[c.tag] ?? TAG_STYLE.WARN
    nodes.push({
      id: cid,
      data: { label: `${c.dimension}\n${c.field}\n${(c.score * 100).toFixed(1)}%` },
      position: { x: 220, y: i * 100 },
      style: { ...style, borderRadius: 10, padding: '8px 14px', fontSize: 11, whiteSpace: 'pre', textAlign: 'center' },
    })
    edges.push({ id: `src-${cid}`, source: 'src', target: cid, style: { stroke: '#374151' } })

    c.impacted_assets.forEach(a => {
      if (!assetIds[a.name]) {
        const aid = `a${Object.keys(assetIds).length}`
        assetIds[a.name] = aid
        nodes.push({
          id: aid,
          data: { label: a.name },
          position: { x: 460, y: (Object.keys(assetIds).length - 1) * 110 },
          style: {
            background: '#0f172a', border: '1px solid #334155', color: '#94a3b8',
            borderRadius: 10, padding: '10px 16px', fontSize: 12, textAlign: 'center',
          },
        })
      }
      const eid = `${cid}-${assetIds[a.name]}`
      if (!edges.find(e => e.id === eid)) {
        edges.push({
          id: eid, source: cid, target: assetIds[a.name],
          animated: c.tag === 'FAIL',
          style: { stroke: c.tag === 'FAIL' ? '#ef4444' : '#f59e0b' },
        })
      }
    })
  })

  return { nodes, edges }
}

export default function LineageGraph({ source, checks }) {
  const { nodes, edges } = buildGraph(source, checks)
  return (
    <div style={{ height: 440 }} className="rounded-xl border border-gray-800 overflow-hidden">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
        <Background color="#1f2937" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
