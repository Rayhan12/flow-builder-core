import { Handle, Position } from '@xyflow/react'

export const SIDE_HANDLE_IDS = ['top', 'right', 'bottom', 'left'] as const
export type SideHandleId = (typeof SIDE_HANDLE_IDS)[number]

const SIDE_POSITION: Record<SideHandleId, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

type Props = {
  /** Skip these side ids (e.g. decision branches occupy bottom). */
  omit?: SideHandleId[]
  className?: string
}

/**
 * Four sides, each with a source and a target handle sharing the side id.
 * ConnectionMode.Loose lets either start a connection; matching type is still
 * required for React Flow to resolve edge sourceHandle/targetHandle ids.
 */
export function SideHandles({ omit = [], className = 'flow-handle' }: Props) {
  const skipped = new Set(omit)
  return (
    <>
      {SIDE_HANDLE_IDS.filter((id) => !skipped.has(id)).flatMap((id) => [
        <Handle
          key={`${id}-source`}
          id={id}
          type="source"
          position={SIDE_POSITION[id]}
          className={className}
          isConnectable
        />,
        <Handle
          key={`${id}-target`}
          id={id}
          type="target"
          position={SIDE_POSITION[id]}
          className={className}
          isConnectable
        />,
      ])}
    </>
  )
}
