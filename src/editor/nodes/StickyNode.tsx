import { NodeResizer, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { DiagramNode } from '../../schema'
import { useEditorStore } from '../../store/editorStore'
import { DATA_COLORS, resolveColor, type DataColorKey } from '../colors'
import type { FlowNode } from '../flowTypes'
import { SideHandles } from './SideHandles'

const STICKY_COLORS: DataColorKey[] = ['yellow', 'amber', 'pink', 'blue', 'green', 'violet']
const MIN_H = 96
const MIN_W = 144

type StickyDiagramNode = Extract<DiagramNode, { kind: 'sticky' }>

function StickyNodeInner(props: NodeProps<FlowNode>) {
  const replaceNode = useEditorStore((s) => s.replaceNode)
  const raw = props.data.diagramNode
  const node: StickyDiagramNode | null = raw.kind === 'sticky' ? raw : null
  const [editing, setEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const measureRef = useRef<HTMLParagraphElement>(null)
  const color = resolveColor(node?.color, 'yellow')
  const text = node?.data.text ?? ''

  useEffect(() => {
    if (!editing) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.select()
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editing])

  // Grow card height to fit full text (width stays user-controlled).
  useLayoutEffect(() => {
    if (!node || editing) return
    const el = measureRef.current
    if (!el) return
    const contentH = Math.ceil(el.scrollHeight) + 24
    const nextH = Math.max(MIN_H, contentH)
    const w = node.size?.w ?? 192
    const h = node.size?.h ?? 160
    if (Math.abs(h - nextH) > 2 && nextH > h) {
      replaceNode({ ...node, size: { w, h: nextH } })
    }
  }, [text, node, editing, replaceNode])

  useEffect(() => {
    if (!node || !props.selected || editing) return
    function onKey(e: globalThis.KeyboardEvent) {
      if (!node) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return
      }
      if (e.key.length === 1) {
        e.preventDefault()
        setEditing(true)
        replaceNode({
          ...node,
          data: { ...node.data, text: e.key },
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.selected, editing, node, replaceNode])

  if (!node) return null

  function commitText(next: string) {
    const el = textareaRef.current
    const contentH = el ? el.scrollHeight + 24 : MIN_H
    const w = Math.max(MIN_W, node!.size?.w ?? 192)
    const h = Math.max(MIN_H, contentH, node!.size?.h ?? 160)
    replaceNode({
      ...node!,
      size: { w, h },
      data: { ...node!.data, text: next },
    })
  }

  function onTextareaKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setEditing(false)
    }
  }

  return (
    <>
      <NodeResizer
        minWidth={MIN_W}
        minHeight={MIN_H}
        isVisible={props.selected}
        lineClassName="group-resize-line"
        handleClassName="group-resize-handle"
      />
      <div
        className={`flow-sticky ${props.selected ? 'is-selected' : ''} ${editing ? 'is-editing' : ''}`}
        style={
          {
            '--node-solid': color.solid,
            '--node-tint': color.tint,
            background: color.tint,
            width: '100%',
            height: '100%',
          } as CSSProperties
        }
        data-testid="sticky-card"
        onDoubleClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            className="flow-sticky-input"
            value={text}
            aria-label="Sticky note text"
            data-testid="sticky-input"
            rows={3}
            onChange={(e) => {
              commitText(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={onTextareaKey}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p ref={measureRef} className="flow-sticky-text" data-testid="sticky-text">
            {text || 'Double-click to edit'}
          </p>
        )}

        {props.selected ? (
          <div
            className="flow-sticky-toolbar"
            role="toolbar"
            aria-label="Sticky colours"
            data-testid="sticky-toolbar"
          >
            {STICKY_COLORS.map((key) => {
              const c = DATA_COLORS.find((d) => d.key === key)!
              const active = (node.color ?? 'yellow') === key
              return (
                <button
                  key={key}
                  type="button"
                  className={`flow-sticky-swatch ${active ? 'is-active' : ''}`}
                  style={{ background: c.solid }}
                  aria-label={c.label}
                  title={c.label}
                  onClick={(e) => {
                    e.stopPropagation()
                    replaceNode({ ...node, color: key })
                  }}
                />
              )
            })}
          </div>
        ) : null}

        <SideHandles />
      </div>
    </>
  )
}

export const StickyNode = memo(StickyNodeInner)
