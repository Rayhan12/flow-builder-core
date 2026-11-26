import { useRef } from 'react'
import type { DiagramNode } from '../../schema'
import { useEditorStore } from '../../store/editorStore'
import { ALIGN_BUTTONS } from '../SelectionToolbar'
import { absolutePosition, defaultNodeSize } from '../flowTypes'
import { NumericScrub } from '../ui/NumericScrub'

const MIXED = 'Mixed'
/** Edits closer together than this share one undo step. */
const BURST_MS = 600

const TEXT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 32]
const TEXT_WEIGHTS: Array<[string, string]> = [
  ['400', 'Regular'],
  ['500', 'Medium'],
  ['600', 'Semibold'],
]

function shared<T>(values: T[]): T | typeof MIXED {
  if (values.length === 0) return MIXED
  const first = values[0]
  return values.every((v) => Object.is(v, first)) ? first : MIXED
}

function hexOr(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

type Props = {
  nodes: DiagramNode[]
  allNodes: DiagramNode[]
}

export function DesignSection({ nodes, allNodes }: Props) {
  const moveNodes = useEditorStore((s) => s.moveNodes)
  const resizeNodes = useEditorStore((s) => s.resizeNodes)
  const patchNodeStyle = useEditorStore((s) => s.patchNodeStyle)
  const alignSelection = useEditorStore((s) => s.alignSelection)
  const distributeSelection = useEditorStore((s) => s.distributeSelection)
  const tidySelection = useEditorStore((s) => s.tidySelection)
  const lastStyleEdit = useRef(0)

  const editable = nodes.filter((n) => !n.locked)
  const ids = editable.map((n) => n.id)
  const abs = nodes.map((n) => absolutePosition(n, allNodes))
  const sizes = nodes.map((n) => n.size ?? defaultNodeSize(n))

  const x = shared(abs.map((p) => Math.round(p.x)))
  const y = shared(abs.map((p) => Math.round(p.y)))
  const w = shared(sizes.map((s) => Math.round(s.w)))
  const h = shared(sizes.map((s) => Math.round(s.h)))

  const fill = shared(nodes.map((n) => n.style?.fill ?? ''))
  const stroke = shared(nodes.map((n) => n.style?.stroke ?? ''))
  const strokeWidth = shared(nodes.map((n) => n.style?.strokeWidth ?? 0))
  const textSize = shared(nodes.map((n) => String(n.style?.textSize ?? '')))
  const textWeight = shared(nodes.map((n) => String(n.style?.textWeight ?? '')))

  function setAbsolute(axis: 'x' | 'y', value: number, record: boolean) {
    const updates = editable.map((n) => {
      const current = absolutePosition(n, allNodes)
      const parent = n.parentId ? allNodes.find((p) => p.id === n.parentId) : undefined
      const parentAbs = parent ? absolutePosition(parent, allNodes) : { x: 0, y: 0 }
      const nextAbs = { ...current, [axis]: value }
      return {
        id: n.id,
        position: { x: nextAbs.x - parentAbs.x, y: nextAbs.y - parentAbs.y },
      }
    })
    moveNodes(updates, record)
  }

  function setSize(axis: 'w' | 'h', value: number, record: boolean) {
    resizeNodes(
      editable.map((n) => {
        const size = n.size ?? defaultNodeSize(n)
        return { id: n.id, size: { ...size, [axis]: value } }
      }),
      record,
    )
  }

  function styleRecord(): boolean {
    const now = Date.now()
    const record = now - lastStyleEdit.current > BURST_MS
    lastStyleEdit.current = now
    return record
  }

  function patchStyle(patch: Parameters<typeof patchNodeStyle>[1]) {
    patchNodeStyle(ids, patch, styleRecord())
  }

  const disabled = editable.length === 0
  const multi = nodes.length > 1

  return (
    <>
      <section className="side-section" data-testid="design-section">
        <h3 className="side-section-label">Position and size</h3>
        {disabled ? <p className="field-help">Unlock the selection to edit its layout.</p> : null}
        <div className="design-grid">
          <NumericScrub
            label="X"
            value={x}
            step={1}
            testId="design-x"
            onChange={(v, info) => setAbsolute('x', v, info.record)}
          />
          <NumericScrub
            label="Y"
            value={y}
            step={1}
            testId="design-y"
            onChange={(v, info) => setAbsolute('y', v, info.record)}
          />
          <NumericScrub
            label="W"
            value={w}
            step={1}
            min={16}
            max={4000}
            testId="design-w"
            onChange={(v, info) => setSize('w', v, info.record)}
          />
          <NumericScrub
            label="H"
            value={h}
            step={1}
            min={16}
            max={4000}
            testId="design-h"
            onChange={(v, info) => setSize('h', v, info.record)}
          />
        </div>
      </section>

      {multi ? (
        <section className="side-section" data-testid="design-align">
          <h3 className="side-section-label">Align</h3>
          <div className="design-align-row" role="toolbar" aria-label="Align selection">
            {ALIGN_BUTTONS.map(({ mode, label, Icon }) => (
              <button
                key={mode}
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={label}
                title={label}
                data-testid={`design-align-${mode}`}
                onClick={() => alignSelection(mode)}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
          <div className="design-align-row">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={nodes.length < 3}
              data-testid="design-distribute-horizontal"
              onClick={() => distributeSelection('horizontal')}
            >
              Distribute across
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={nodes.length < 3}
              data-testid="design-distribute-vertical"
              onClick={() => distributeSelection('vertical')}
            >
              Distribute down
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              data-testid="design-tidy"
              onClick={() => tidySelection()}
            >
              Tidy up
            </button>
          </div>
        </section>
      ) : null}

      <section className="side-section" data-testid="design-appearance">
        <h3 className="side-section-label">Appearance</h3>
        <div className="design-grid design-grid-single">
          <label className="design-swatch">
            <span className="design-swatch-label">Fill</span>
            <input
              type="color"
              aria-label="Fill colour"
              data-testid="design-fill"
              disabled={disabled}
              value={hexOr(fill === MIXED ? undefined : fill, '#ffffff')}
              onChange={(e) => patchStyle({ fill: e.target.value })}
            />
            <span className="design-swatch-value">
              {fill === MIXED ? MIXED : fill ? fill.toUpperCase() : 'Default'}
            </span>
            {fill !== '' ? (
              <button
                type="button"
                className="design-swatch-clear"
                aria-label="Reset fill"
                onClick={(e) => {
                  e.preventDefault()
                  patchNodeStyle(ids, { fill: undefined }, true)
                }}
              >
                Reset
              </button>
            ) : null}
          </label>
          <label className="design-swatch">
            <span className="design-swatch-label">Stroke</span>
            <input
              type="color"
              aria-label="Stroke colour"
              data-testid="design-stroke"
              disabled={disabled}
              value={hexOr(stroke === MIXED ? undefined : stroke, '#64748b')}
              onChange={(e) => patchStyle({ stroke: e.target.value })}
            />
            <span className="design-swatch-value">
              {stroke === MIXED ? MIXED : stroke ? stroke.toUpperCase() : 'Default'}
            </span>
            {stroke !== '' ? (
              <button
                type="button"
                className="design-swatch-clear"
                aria-label="Reset stroke"
                onClick={(e) => {
                  e.preventDefault()
                  patchNodeStyle(ids, { stroke: undefined }, true)
                }}
              >
                Reset
              </button>
            ) : null}
          </label>
          <NumericScrub
            label="Stroke width"
            value={strokeWidth}
            min={0}
            max={16}
            step={0.5}
            testId="design-stroke-width"
            onChange={(v, info) =>
              patchNodeStyle(ids, { strokeWidth: v === 0 ? undefined : v }, info.record)
            }
          />
        </div>
        <div className="design-grid">
          <label className="field">
            <span>Text size</span>
            <select
              data-testid="design-text-size"
              disabled={disabled}
              value={textSize}
              onChange={(e) =>
                e.target.value !== MIXED &&
                patchNodeStyle(
                  ids,
                  { textSize: e.target.value ? Number(e.target.value) : undefined },
                  true,
                )
              }
            >
              {textSize === MIXED ? <option value={MIXED}>Mixed</option> : null}
              <option value="">Default</option>
              {TEXT_SIZES.map((size) => (
                <option key={size} value={String(size)}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Text weight</span>
            <select
              data-testid="design-text-weight"
              disabled={disabled}
              value={textWeight}
              onChange={(e) =>
                e.target.value !== MIXED &&
                patchNodeStyle(
                  ids,
                  { textWeight: e.target.value ? (Number(e.target.value) as 400 | 500 | 600) : undefined },
                  true,
                )
              }
            >
              {textWeight === MIXED ? <option value={MIXED}>Mixed</option> : null}
              <option value="">Default</option>
              {TEXT_WEIGHTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
    </>
  )
}
