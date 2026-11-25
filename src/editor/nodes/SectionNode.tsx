import { NodeResizer, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { memo } from 'react'
import { useEditorStore } from '../../store/editorStore'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function SectionNodeInner(props: NodeProps<FlowNode>) {
  const replaceNode = useEditorStore((s) => s.replaceNode)
  const node = props.data.diagramNode
  if (node.kind !== 'section') return null

  const collapsed = node.data.collapsed === true

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
      <FlowNodeShell {...props} groupStyle showTarget={false} showSource={false}>
        <button
          type="button"
          className="flow-group-collapse"
          aria-label={collapsed ? 'Expand section' : 'Collapse section'}
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

export const SectionNode = memo(SectionNodeInner)
