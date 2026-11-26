import { NodeResizer, type NodeProps } from '@xyflow/react'
import { memo, useMemo, type CSSProperties } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { resolveColor } from '../colors'
import type { FlowNode } from '../flowTypes'
import { KIND_META } from '../kinds'
import { CollapseHeader } from '../ui/CollapseToggle'
import { SideHandles } from './SideHandles'

function GroupNodeInner(props: NodeProps<FlowNode>) {
  const replaceNode = useEditorStore((s) => s.replaceNode)
  const diagram = useEditorStore((s) => s.diagram)
  const node = props.data.diagramNode
  const isGroup = node.kind === 'group'
  const collapsed = isGroup && node.data.collapsed === true
  const color = resolveColor(
    isGroup ? (node.color ?? node.data.color) : undefined,
    KIND_META.group.defaultColor,
  )
  const childCount = useMemo(
    () => (isGroup ? (diagram?.nodes.filter((n) => n.parentId === node.id).length ?? 0) : 0),
    [diagram?.nodes, node.id, isGroup],
  )

  if (!isGroup) return null

  return (
    <>
      {!collapsed ? (
        <NodeResizer
          minWidth={200}
          minHeight={120}
          isVisible={props.selected}
          lineClassName="group-resize-line"
          handleClassName="group-resize-handle"
        />
      ) : null}
      <div
        className={`flow-group ${props.selected ? 'is-selected' : ''} ${collapsed ? 'is-collapsed' : ''}`}
        style={
          {
            '--node-solid': color.solid,
            '--node-tint': color.tint,
            width: '100%',
            height: '100%',
          } as CSSProperties
        }
        data-testid="group-card"
      >
        <CollapseHeader
          open={!collapsed}
          onToggle={() =>
            replaceNode({
              ...node,
              data: { ...node.data, collapsed: !collapsed },
            })
          }
          testId="group-header"
          toggleTestId="group-collapse"
          ariaLabel={collapsed ? 'Expand group' : 'Collapse group'}
          className="flow-group-header"
          label={
            <input
              className="flow-group-title"
              value={node.data.label}
              aria-label="Group title"
              data-testid="group-title"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                replaceNode({
                  ...node,
                  label: e.target.value,
                  data: { ...node.data, label: e.target.value },
                })
              }
            />
          }
          trailing={
            <span className="flow-group-count" title="Child nodes">
              {childCount}
            </span>
          }
        />
        <SideHandles />
      </div>
    </>
  )
}

export const GroupNode = memo(GroupNodeInner)
