import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { DiagramNode } from '../../schema'
import type { FlowNode } from '../flowTypes'
import { FlowNodeShell } from './FlowNodeShell'

function detailRows(node: DiagramNode): string[] {
  switch (node.kind) {
    case 'loop':
      return [node.data?.collection ? `For each ${node.data.collection}` : 'Iterate'].filter(Boolean)
    case 'parallelSplit':
      return ['Split paths']
    case 'parallelJoin':
      return [`Wait for ${node.data?.waitFor ?? 'all'}`]
    case 'delay':
      return [
        node.data?.durationMs != null ? `Wait ${node.data.durationMs} ms` : node.data?.until ?? 'Wait',
      ]
    case 'subflow':
      return [node.data?.diagramTitle || node.data?.diagramId || 'Linked diagram']
    case 'error':
      return [node.data?.code, node.data?.message].filter((v): v is string => Boolean(v))
    case 'database':
      return [
        node.data?.operation,
        node.data?.collection,
      ].filter((v): v is string => Boolean(v))
    case 'inputForm':
      return [`${node.data?.fields?.length ?? 0} fields`]
    case 'output':
      return [node.data?.format ? `Format: ${node.data.format}` : 'Output']
    case 'score':
      return [
        node.data?.model,
        node.data?.threshold != null ? `Threshold ${node.data.threshold}` : undefined,
      ].filter((v): v is string => Boolean(v))
    case 'lookup':
      return [node.data?.table, node.data?.keyField].filter((v): v is string => Boolean(v))
    case 'actor':
      return [node.data?.role].filter((v): v is string => Boolean(v))
    case 'approval':
      return ['Manual review']
    case 'notification':
      return [node.data?.channel, node.data?.to].filter((v): v is string => Boolean(v))
    case 'timer':
      return [node.data?.cron].filter((v): v is string => Boolean(v))
    case 'event':
      return [node.data?.eventName, node.data?.source].filter((v): v is string => Boolean(v))
    case 'callout':
      return []
    case 'image':
      return [node.data?.url ? 'Image URL set' : 'Add image URL']
    case 'link':
      return [node.data?.href].filter((v): v is string => Boolean(v))
    case 'divider':
      return []
    default:
      return []
  }
}

function GenericNodeInner(props: NodeProps<FlowNode>) {
  const node = props.data.diagramNode
  const rows = detailRows(node)
  const calloutText = node.kind === 'callout' ? (node.data?.text ?? '') : ''
  const imageUrl = node.kind === 'image' ? (node.data?.url ?? '') : ''
  const isDivider = node.kind === 'divider'
  const noteStyle = node.kind === 'callout' || node.kind === 'note'

  if (isDivider) {
    return (
      <FlowNodeShell {...props} compact hideHeader>
        <div className="flow-divider" data-testid="divider-card" aria-hidden />
      </FlowNodeShell>
    )
  }

  return (
    <FlowNodeShell {...props} noteStyle={noteStyle} compact={node.kind === 'link'}>
      {calloutText ? <p className="flow-node-note-text">{calloutText}</p> : null}
      {imageUrl ? (
        <img
          className="flow-node-image"
          src={imageUrl}
          alt={node.kind === 'image' ? (node.data?.alt ?? node.label) : node.label}
          data-testid="image-node-preview"
        />
      ) : null}
      {rows.length > 0 ? (
        <div className="flow-node-kv">
          {rows.map((row) => (
            <span key={row} className="flow-node-kv-row">
              {row}
            </span>
          ))}
        </div>
      ) : null}
    </FlowNodeShell>
  )
}

export const GenericNode = memo(GenericNodeInner)
