import { useConnection, useNodeId } from '@xyflow/react'
import { Plus } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { SIDE_HANDLE_IDS, type SideHandleId } from './sideIds'

/** Sit ~24px beyond the handle so press-and-drag on the handle starts a connection. */
const SIDE_STYLE: Record<SideHandleId, CSSProperties> = {
  top: { top: -24, left: '50%', transform: 'translate(-50%, -50%)' },
  right: { top: '50%', right: -24, transform: 'translate(50%, -50%)' },
  bottom: { bottom: -24, left: '50%', transform: 'translate(-50%, 50%)' },
  left: { top: '50%', left: -24, transform: 'translate(-50%, -50%)' },
}

const SHOW_DELAY_MS = 220

type Props = {
  omit?: SideHandleId[]
}

/**
 * Hover + buttons on each side. Click adds a connected node of the same kind
 * (or step) placed with spacing and snapped. Pointer events stay off until a
 * short hover delay so handle-drags and nearby edge clicks are not stolen.
 */
export function QuickAddButtons({ omit = [] }: Props) {
  const nodeId = useNodeId()
  const connection = useConnection()
  const addConnectedNode = useEditorStore((s) => s.addConnectedNode)
  const skipped = new Set(omit)
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!nodeId) return
    const nodeEl = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`)
    if (!nodeEl) return
    let timer: number | null = null
    const onEnter = () => {
      timer = window.setTimeout(() => setArmed(true), SHOW_DELAY_MS)
    }
    const onLeave = () => {
      if (timer != null) window.clearTimeout(timer)
      timer = null
      setArmed(false)
    }
    nodeEl.addEventListener('mouseenter', onEnter)
    nodeEl.addEventListener('mouseleave', onLeave)
    return () => {
      if (timer != null) window.clearTimeout(timer)
      nodeEl.removeEventListener('mouseenter', onEnter)
      nodeEl.removeEventListener('mouseleave', onLeave)
    }
  }, [nodeId])

  if (!nodeId || connection.inProgress) return null

  return (
    <div
      className={`quick-add-buttons ${armed ? 'is-armed' : ''}`}
      data-testid="quick-add-buttons"
      data-armed={armed ? 'true' : undefined}
    >
      {SIDE_HANDLE_IDS.filter((id) => !skipped.has(id)).map((side) => (
        <button
          key={side}
          type="button"
          className={`quick-add-btn quick-add-btn-${side}`}
          style={SIDE_STYLE[side]}
          aria-label={`Add connected node on ${side}`}
          data-testid={`quick-add-${side}`}
          title={`Add connected node (${side})`}
          tabIndex={armed ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            if (!armed) return
            addConnectedNode(nodeId, side)
          }}
          onPointerDown={(e) => {
            if (!armed) return
            e.stopPropagation()
          }}
        >
          <Plus size={10} strokeWidth={2.5} />
        </button>
      ))}
    </div>
  )
}
