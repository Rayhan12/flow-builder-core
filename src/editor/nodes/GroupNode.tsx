import { NodeResizer, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

export function GroupNode(props: NodeProps<FlowNode>) {
  const replaceNode = useEditorStore((s) => s.replaceNode)
  const node = props.data.diagramNode
  if (node.kind !== 'group') return null

  const collapsed = node.data.collapsed === true

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
      <FlowNodeShell {...props} groupStyle showTarget={false} showSource={false}>
        <button
          type="button"
          className="flow-group-collapse"
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
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
      </FlowNodeShell>
    </>
  )
}
