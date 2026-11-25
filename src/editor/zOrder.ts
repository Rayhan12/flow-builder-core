import { isContainerKind, type DiagramNode } from '../schema'

export type ZOrderAction = 'forward' | 'backward' | 'front' | 'back'

function effectiveZ(node: DiagramNode): number {
  if (typeof node.zIndex === 'number') return node.zIndex
  return isContainerKind(node.kind) ? -1 : 1
}

/**
 * Reorder selected nodes relative to siblings (same parentId).
 * Containers stay below non-containers unless the user explicitly raises them.
 */
export function applyZOrder(
  nodes: DiagramNode[],
  selectedIds: string[],
  action: ZOrderAction,
): DiagramNode[] {
  if (selectedIds.length === 0) return nodes
  const selected = new Set(selectedIds)

  // Group by parent so z-order is local to a stacking context.
  const byParent = new Map<string | undefined, DiagramNode[]>()
  for (const node of nodes) {
    const key = node.parentId
    const list = byParent.get(key) ?? []
    list.push(node)
    byParent.set(key, list)
  }

  const nextById = new Map<string, DiagramNode>()

  for (const [, siblings] of byParent) {
    const ordered = [...siblings].sort((a, b) => {
      const z = effectiveZ(a) - effectiveZ(b)
      if (z !== 0) return z
      return nodes.indexOf(a) - nodes.indexOf(b)
    })

    const selectedInGroup = ordered.filter((n) => selected.has(n.id))
    if (selectedInGroup.length === 0) {
      for (const n of ordered) nextById.set(n.id, n)
      continue
    }

    let nextOrdered = [...ordered]
    if (action === 'front') {
      nextOrdered = [
        ...ordered.filter((n) => !selected.has(n.id)),
        ...selectedInGroup,
      ]
    } else if (action === 'back') {
      nextOrdered = [
        ...selectedInGroup,
        ...ordered.filter((n) => !selected.has(n.id)),
      ]
    } else if (action === 'forward') {
      for (let i = nextOrdered.length - 2; i >= 0; i -= 1) {
        if (selected.has(nextOrdered[i].id) && !selected.has(nextOrdered[i + 1].id)) {
          const tmp = nextOrdered[i]
          nextOrdered[i] = nextOrdered[i + 1]
          nextOrdered[i + 1] = tmp
        }
      }
    } else {
      for (let i = 1; i < nextOrdered.length; i += 1) {
        if (selected.has(nextOrdered[i].id) && !selected.has(nextOrdered[i - 1].id)) {
          const tmp = nextOrdered[i]
          nextOrdered[i] = nextOrdered[i - 1]
          nextOrdered[i - 1] = tmp
        }
      }
    }

    // Assign contiguous zIndex values; containers get a lower baseline.
    nextOrdered.forEach((node, index) => {
      const baseline = isContainerKind(node.kind) ? -1000 : 0
      nextById.set(node.id, { ...node, zIndex: baseline + index })
    })
  }

  // Preserve overall array order but put lower zIndex first so React Flow paints
  // containers before children when zIndex ties.
  return [...nodes]
    .map((n) => nextById.get(n.id) ?? n)
    .sort((a, b) => {
      const z = effectiveZ(a) - effectiveZ(b)
      if (z !== 0) return z
      return 0
    })
}

/** Stable paint order: containers first, then by zIndex, then original order. */
export function sortNodesForCanvas(nodes: DiagramNode[]): DiagramNode[] {
  return [...nodes].sort((a, b) => {
    const aContainer = isContainerKind(a.kind) ? 0 : 1
    const bContainer = isContainerKind(b.kind) ? 0 : 1
    if (aContainer !== bContainer) return aContainer - bContainer
    const z = effectiveZ(a) - effectiveZ(b)
    if (z !== 0) return z
    // Parents before their children within the same band.
    if (a.id === b.parentId) return -1
    if (b.id === a.parentId) return 1
    return 0
  })
}

export function effectiveZIndex(node: DiagramNode): number {
  return effectiveZ(node)
}
