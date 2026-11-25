import { NodeResizer, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { memo, useMemo, type CSSProperties } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { resolveColor } from '../colors'
import type { FlowNode } from '../flowTypes'
import { KIND_META } from '../kinds'
import { SideHandles } from './SideHandles'

function SectionNodeInner(props: NodeProps<FlowNode>) {
  const replaceNode = useEditorStore((s) => s.replaceNode)
  const diagram = useEditorStore((s) => s.diagram)
  const node = props.data.diagramNode
  const isSection = node.kind === 'section'
  const collapsed = isSection && node.data.collapsed === true
  const color = resolveColor(
    isSection ? (node.color ?? node.data.color) : undefined,
    KIND_META.section.defaultColor,
  )
  const childCount = useMemo(
    () => (isSection ? (diagram?.nodes.filter((n) => n.parentId === node.id).length ?? 0) : 0),
    [diagram?.nodes, node.id, isSection],
  )

  if (!isSection) return null

  return (
    <>
      {!collapsed ? (
        <NodeResizer
          minWidth={240}
          minHeight={160}
          isVisible={props.selected}
          lineClassName="group-resize-line"
          handleClassName="group-resize-handle"
        />
      ) : null}
      <div
        className={`flow-group flow-section ${props.selected ? 'is-selected' : ''} ${collapsed ? 'is-collapsed' : ''}`}
        style={
          {
            '--node-solid': color.solid,
            '--node-tint': color.tint,
            width: '100%',
            height: '100%',
          } as CSSProperties
        }
        data-testid="section-card"
      >
        <div className="flow-group-header" data-testid="section-header">
          <button
            type="button"
            className="flow-group-collapse"
            aria-label={collapsed ? 'Expand section' : 'Collapse section'}
            data-testid="section-collapse"
            onClick={(e) => {
              e.stopPropagation()
              replaceNode({
                ...node,
                data: { ...node.data, collapsed: !collapsed },
              })
            }}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <input
            className="flow-group-title"
            value={node.data.label}
            aria-label="Section title"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              replaceNode({
                ...node,
                label: e.target.value,
                data: { ...node.data, label: e.target.value },
              })
            }
          />
          <span className="flow-group-count" title="Child nodes">
            {childCount}
          </span>
        </div>
        <SideHandles />
      </div>
    </>
  )
}

export const SectionNode = memo(SectionNodeInner)
