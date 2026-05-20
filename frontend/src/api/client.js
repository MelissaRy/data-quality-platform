const BASE = import.meta.env.VITE_API_URL ?? ''

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json()
}

export const getSources  = ()       => get('/api/sources')
export const getSource   = (name)   => get(`/api/sources/${name}`)
export const getRuns     = (source) => get(`/api/runs/${source}`)
export const getLineage  = (source) => get(`/api/lineage/${source}`)
export const getFailing  = ()       => get('/api/lineage')
