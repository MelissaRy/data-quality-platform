import { useState, useEffect } from 'react'

const ACCENTS = [
  { id: 'terracotta', swatch: 'oklch(0.640 0.135 45)',  label: 'Terra' },
  { id: 'sage',       swatch: 'oklch(0.580 0.105 155)', label: 'Sage' },
  { id: 'plum',       swatch: 'oklch(0.535 0.120 340)', label: 'Plum' },
  { id: 'indigo',     swatch: 'oklch(0.560 0.135 275)', label: 'Indigo' },
]

const DEFAULTS = { theme: 'light', density: 'cozy', accent: 'terracotta' }

function applyTweaks(tweaks) {
  const root = document.documentElement
  root.setAttribute('data-theme',   tweaks.theme)
  root.setAttribute('data-density', tweaks.density)
  root.setAttribute('data-accent',  tweaks.accent)
}

export default function Tweaks() {
  const [open,   setOpen]   = useState(false)
  const [tweaks, setTweaks] = useState(DEFAULTS)

  useEffect(() => { applyTweaks(tweaks) }, [tweaks])

  const set = (key, value) => setTweaks(t => ({ ...t, [key]: value }))

  if (!open) {
    return (
      <button className="tweaks__open-btn" onClick={() => setOpen(true)} aria-label="Open tweaks" title="Tweaks">
        ✦
      </button>
    )
  }

  return (
    <div className="tweaks">
      <header className="tweaks__head">
        <div className="tweaks__title">Tweaks</div>
        <button className="tweaks__close" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </header>
      <div className="tweaks__body">
        <div>
          <div className="tweaks__group__label">Theme</div>
          <div className="tweaks__segmented">
            {['light', 'dark'].map(opt => (
              <button key={opt} className={'tweaks__seg' + (tweaks.theme === opt ? ' tweaks__seg--active' : '')} onClick={() => set('theme', opt)}>
                {opt[0].toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="tweaks__group__label">Density</div>
          <div className="tweaks__segmented tweaks__segmented--3">
            {['compact', 'cozy', 'spacious'].map(opt => (
              <button key={opt} className={'tweaks__seg' + (tweaks.density === opt ? ' tweaks__seg--active' : '')} onClick={() => set('density', opt)}>
                {opt[0].toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="tweaks__group__label">Accent</div>
          <div className="tweaks__swatches" style={{ marginBottom: 20 }}>
            {ACCENTS.map(a => (
              <button
                key={a.id}
                className={'tweaks__swatch' + (tweaks.accent === a.id ? ' tweaks__swatch--active' : '')}
                style={{ background: a.swatch }}
                onClick={() => set('accent', a.id)}
                aria-label={a.label}
              >
                <span className="tweaks__swatch__label">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
