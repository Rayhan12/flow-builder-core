import { NodeResizer, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { DiagramNode, ShapeType } from '../../schema'
import { useEditorStore } from '../../store/editorStore'
import { resolveColor } from '../colors'
import type { FlowNode } from '../flowTypes'
import { SideHandles } from './SideHandles'
import { shapeSvgContent } from './shapePaths'

type ShapeDiagramNode = Extract<DiagramNode, { kind: 'shape' }>

function ShapeNodeInner(props: NodeProps<FlowNode>) {
  const replaceNode = useEditorStore((s) => s.replaceNode)
  const raw = props.data.diagramNode
  const node: ShapeDiagramNode | null = raw.kind === 'shape' ? raw : null
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [editing])

  if (!node) return null

  const shape = (node.data.shape ?? 'rect') as ShapeType
  const text = node.data.text ?? node.label
  const color = resolveColor(node.color, 'slate')
  const fill = node.style?.fill ?? color.tint
  const stroke = node.style?.stroke ?? color.solid
  const strokeWidth = node.style?.strokeWidth ?? 1.5
  const svg = shapeSvgContent(shape)

  function commitText(next: string) {
    replaceNode({
      ...node!,
      label: next || node!.label,
      data: { ...node!.data, text: next },
    })
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setEditing(false)
    }
  }

  return (
    <>
      <NodeResizer
        minWidth={80}
        minHeight={64}
        isVisible={props.selected}
        lineClassName="group-resize-line"
        handleClassName="group-resize-handle"
      />
      <div
        className={`flow-shape ${props.selected ? 'is-selected' : ''} ${editing ? 'is-editing' : ''}`}
        style={
          {
            '--node-solid': color.solid,
            '--node-tint': color.tint,
            width: '100%',
            height: '100%',
          } as CSSProperties
        }
        data-testid="shape-card"
        data-shape={shape}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        <svg
          className="flow-shape-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {svg.rect ? (
            <rect
              x={svg.rect.x}
              y={svg.rect.y}
              width={svg.rect.w}
              height={svg.rect.h}
              rx={svg.rect.rx ?? 0}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {svg.ellipse ? (
            <ellipse
              cx={svg.ellipse.cx}
              cy={svg.ellipse.cy}
              rx={svg.ellipse.rx}
              ry={svg.ellipse.ry}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {svg.path ? (
            <path
              d={svg.path}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {svg.extra ? (
            <path
              d={svg.extra}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        <div className="flow-shape-text-wrap">
          {editing ? (
            <textarea
              ref={inputRef}
              className="flow-shape-input"
              value={text}
              aria-label="Shape text"
              data-testid="shape-input"
              rows={2}
              onChange={(e) => commitText(e.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={onKey}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p className="flow-shape-text" data-testid="shape-text">
              {text}
            </p>
          )}
        </div>
        <SideHandles />
      </div>
    </>
  )
}

export const ShapeNode = memo(ShapeNodeInner)
