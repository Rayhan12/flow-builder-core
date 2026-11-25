import { useState } from 'react'
import { DATA_COLORS, isDataColorKey, resolveColor } from './colors'

type Props = {
  value?: string
  onChange: (color: string) => void
  fallback?: string
}

function normalizeHex(raw: string): string | null {
  const value = raw.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [, a, b, c] = value
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase()
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value.toLowerCase()}`
  return null
}

export function ColourPicker({ value, onChange, fallback = 'slate' }: Props) {
  const resolved = resolveColor(value, isDataColorKey(fallback) ? fallback : 'slate')
  const isCustom = Boolean(value && value.startsWith('#'))
  const [hexDraft, setHexDraft] = useState(isCustom ? value! : resolved.solid)

  return (
    <div className="colour-picker">
      <div className="color-swatches" role="listbox" aria-label="Colour">
        {DATA_COLORS.map((c) => {
          const active = value === c.key || (!value && c.key === fallback)
          return (
            <button
              key={c.key}
              type="button"
              role="option"
              aria-selected={active}
              className={`color-swatch ${active && !isCustom ? 'is-active' : ''}`}
              style={{ background: c.solid }}
              title={c.label}
              aria-label={c.label}
              onClick={() => {
                onChange(c.key)
                setHexDraft(c.solid)
              }}
            />
          )
        })}
      </div>
      <label className="field colour-custom">
        <span>Custom</span>
        <div className="colour-custom-row">
          <input
            type="color"
            aria-label="Custom colour"
            value={normalizeHex(hexDraft) ?? '#64748b'}
            onChange={(e) => {
              const next = e.target.value.toLowerCase()
              setHexDraft(next)
              onChange(next)
            }}
          />
          <input
            value={hexDraft}
            placeholder="#64748b"
            maxLength={7}
            aria-label="Custom hex colour"
            onChange={(e) => {
              setHexDraft(e.target.value)
              const next = normalizeHex(e.target.value)
              if (next) onChange(next)
            }}
            onBlur={() => {
              const next = normalizeHex(hexDraft)
              if (next) {
                setHexDraft(next)
                onChange(next)
              } else {
                setHexDraft(isCustom && value ? value : resolved.solid)
              }
            }}
          />
        </div>
      </label>
    </div>
  )
}
