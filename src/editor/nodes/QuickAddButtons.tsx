import { useConnection, useNodeId } from '@xyflow/react'
import { Plus } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { SIDE_HANDLE_IDS, type SideHandleId } from './sideIds'

const SIDE_STYLE: Record<SideHandleId, CSSProperties> = {
  top: { top: 0, left: '50%', transform: 'translate(-50%, -50%)' },
  right: { top: '50%', right: 0, transform: 'translate(50%, -50%)' },
  bottom: { bottom: 0, left: '50%', transform: 'translate(-50%, 50%)' },
  left: { top: '50%', left: 0, transform: 'translate(-50%, -50%)' },
}

type Props = {
  omit?: SideHandleId[]
}

/**
 * Hover + buttons on each side. Click adds a connected node of the same kind
 * (or step) placed with spacing and snapped.
 */
export function QuickAddButtons({ omit = [] }: Props) {
  const nodeId = useNodeId()
  const connection = useConnection()
  const addConnectedNode = useEditorStore((s) => s.addConnectedNode)
  const skipped = new Set(omit)

  if (!nodeId || connection.inProgress) return null

  return (
    <div className="quick-add-buttons" data-testid="quick-add-buttons">
      {SIDE_HANDLE_IDS.filter((id) => !skipped.has(id)).map((side) => (
        <button
          key={side}
          type="button"
          className={`quick-add-btn quick-add-btn-${side}`}
          style={SIDE_STYLE[side]}
          aria-label={`Add connected node on ${side}`}
          data-testid={`quick-add-${side}`}
          title={`Add connected node (${side})`}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            addConnectedNode(nodeId, side)
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Plus size={10} strokeWidth={2.5} />
        </button>
      ))}
    </div>
  )
}
