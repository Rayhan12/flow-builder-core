import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import { createNodeOfKind } from '../../editor/kinds'
import { toFlowNode, type FlowNode } from '../../editor/flowTypes'
import { nodeTypes } from '../../editor/nodes'

function buildPreviewNodes(): FlowNode[] {
  const start = createNodeOfKind('start', { x: 72, y: 16 }, {
    id: 'preview-start',
    label: 'Start',
  })
  const rule = createNodeOfKind('rule', { x: 48, y: 120 }, {
    id: 'preview-rule',
    label: 'Credit check',
  })
  const decision = createNodeOfKind('decision', { x: 40, y: 248 }, {
    id: 'preview-decision',
    label: 'Approved?',
  })
  const end = createNodeOfKind('end', { x: 72, y: 400 }, {
    id: 'preview-end',
    label: 'Done',
  })

  return [start, rule, decision, end].map((n) => toFlowNode(n, false))
}

const PREVIEW_EDGES: Edge[] = [
  {
    id: 'e1',
    source: 'preview-start',
    target: 'preview-rule',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'smoothstep',
    style: { stroke: '#8b8d98', strokeWidth: 1.5 },
  },
  {
    id: 'e2',
    source: 'preview-rule',
    target: 'preview-decision',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'smoothstep',
    style: { stroke: '#8b8d98', strokeWidth: 1.5 },
  },
  {
    id: 'e3',
    source: 'preview-decision',
    sourceHandle: 'yes',
    target: 'preview-end',
    targetHandle: 'top',
    type: 'smoothstep',
    style: { stroke: '#12b76a', strokeWidth: 1.5 },
  },
]

function AuthDiagramCanvas() {
  const nodes = useMemo(() => buildPreviewNodes(), [])
  const edges = useMemo(() => PREVIEW_EDGES, [])

  return (
    <ReactFlow
      className="auth-diagram-flow"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 0.85 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      panOnScroll={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling
      proOptions={{ hideAttribution: true }}
    >
      <Background
        id="auth-dots"
        variant={BackgroundVariant.Dots}
        gap={16}
        size={1}
        color="#d5d7de"
      />
    </ReactFlow>
  )
}

/** Read-only mini diagram for the auth showcase panel. */
export function AuthDiagramPreview() {
  return (
    <div className="auth-diagram" aria-hidden>
      <ReactFlowProvider>
        <AuthDiagramCanvas />
      </ReactFlowProvider>
    </div>
  )
}
