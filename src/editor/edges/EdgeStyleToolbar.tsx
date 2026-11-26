import {
  Minus,
  Trash2,
  Type,
} from 'lucide-react'
import type { DiagramEdge, EdgeMarker } from '../../schema'
import { useEditorStore } from '../../store/editorStore'

const SWATCHES = ['#94A3B8', '#0D9488', '#F59E0B', '#EF4444', '#6366F1', '#64748B'] as const

type Props = {
  edgeIds: string[]
}

function shared<T>(values: T[]): T | 'mixed' {
  if (values.length === 0) return 'mixed'
  const first = values[0]
  return values.every((v) => Object.is(v, first)) ? first : 'mixed'
}

/**
 * Floating FigJam-style connector toolbar: type, stroke, dash, colour,
 * arrowheads, label, delete. Multi-select applies to all selected edges.
 */
export function EdgeStyleToolbar({ edgeIds }: Props) {
  const diagram = useEditorStore((s) => s.diagram)
  const updateEdges = useEditorStore((s) => s.updateEdges)
  const updateEdge = useEditorStore((s) => s.updateEdge)
  const removeEdges = useEditorStore((s) => s.removeEdges)
  if (!diagram || edgeIds.length === 0) return null

  const idSet = new Set(edgeIds)
  const edges = diagram.edges.filter((e) => idSet.has(e.id))
  if (edges.length === 0) return null

  const type = shared(edges.map((e) => e.type ?? 'elbow'))
  const width = shared(edges.map((e) => e.style?.width ?? 1.5))
  const dash = shared(edges.map((e) => e.style?.dash ?? 'solid'))
  const color = shared(edges.map((e) => e.style?.color ?? e.color ?? '#94A3B8'))
  const start = shared(edges.map((e) => e.startMarker ?? 'none'))
  const end = shared(edges.map((e) => e.endMarker ?? 'arrowFilled'))

  function patchAll(patch: Partial<DiagramEdge>) {
    updateEdges(edgeIds, patch)
  }

  function patchStyle(partial: NonNullable<DiagramEdge['style']>) {
    for (const edge of edges) {
      updateEdge(edge.id, { style: { ...(edge.style ?? {}), ...partial } })
    }
  }

  return (
    <div
      className="edge-style-toolbar"
      role="toolbar"
      aria-label="Connector style"
      data-testid="edge-style-toolbar"
    >
      <select
        aria-label="Line type"
        data-testid="edge-toolbar-type"
        value={type === 'mixed' ? 'elbow' : type}
        onChange={(e) =>
          patchAll({ type: e.target.value as 'elbow' | 'straight' | 'curved' })
        }
      >
        <option value="elbow">Elbow</option>
        <option value="straight">Straight</option>
        <option value="curved">Curved</option>
      </select>
      <span className="edge-style-toolbar-divider" aria-hidden />
      <button
        type="button"
        className={`btn btn-ghost btn-icon ${width === 1.5 ? 'is-active' : ''}`}
        aria-label="Thin stroke"
        data-testid="edge-toolbar-thin"
        onClick={() => patchStyle({ width: 1.5 })}
      >
        <Minus size={12} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={`btn btn-ghost btn-icon ${width === 2.5 ? 'is-active' : ''}`}
        aria-label="Thick stroke"
        data-testid="edge-toolbar-thick"
        onClick={() => patchStyle({ width: 2.5 })}
      >
        <Minus size={14} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className={`btn btn-ghost btn-sm ${dash === 'solid' ? 'is-active' : ''}`}
        aria-label="Solid"
        data-testid="edge-toolbar-solid"
        onClick={() => patchStyle({ dash: 'solid' })}
      >
        Solid
      </button>
      <button
        type="button"
        className={`btn btn-ghost btn-sm ${dash === 'dashed' ? 'is-active' : ''}`}
        aria-label="Dashed"
        data-testid="edge-toolbar-dashed"
        onClick={() => patchStyle({ dash: 'dashed' })}
      >
        Dashed
      </button>
      <span className="edge-style-toolbar-divider" aria-hidden />
      <div className="edge-style-swatches" role="group" aria-label="Colour">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={`edge-style-swatch ${color === swatch ? 'is-active' : ''}`}
            style={{ background: swatch }}
            aria-label={`Colour ${swatch}`}
            data-testid={`edge-toolbar-color-${swatch.slice(1)}`}
            onClick={() => {
              patchStyle({ color: swatch })
              patchAll({ color: swatch })
            }}
          />
        ))}
      </div>
      <span className="edge-style-toolbar-divider" aria-hidden />
      <select
        aria-label="Start arrowhead"
        data-testid="edge-toolbar-start"
        value={start === 'mixed' ? 'none' : start}
        onChange={(e) => patchAll({ startMarker: e.target.value as EdgeMarker })}
      >
        <option value="none">Start none</option>
        <option value="arrow">Start arrow</option>
        <option value="arrowFilled">Start triangle</option>
        <option value="diamond">Start diamond</option>
      </select>
      <select
        aria-label="End arrowhead"
        data-testid="edge-toolbar-end"
        value={end === 'mixed' ? 'arrowFilled' : end}
        onChange={(e) => patchAll({ endMarker: e.target.value as EdgeMarker })}
      >
        <option value="none">End none</option>
        <option value="arrow">End arrow</option>
        <option value="arrowFilled">End triangle</option>
        <option value="diamond">End diamond</option>
      </select>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label="Edit label"
        data-testid="edge-toolbar-label"
        onClick={() => {
          const current = edges.length === 1 ? (edges[0].label ?? '') : ''
          const next = window.prompt('Connector label', current)
          if (next == null) return
          patchAll({ label: next || undefined })
        }}
      >
        <Type size={14} />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label="Delete connector"
        data-testid="edge-toolbar-delete"
        onClick={() => removeEdges(edgeIds)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
