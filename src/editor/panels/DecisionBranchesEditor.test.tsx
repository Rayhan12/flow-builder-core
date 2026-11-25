import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiagramNode } from '../../schema'
import { DecisionBranchesEditor } from './DecisionBranchesEditor'

const baseNode: Extract<DiagramNode, { kind: 'decision' }> = {
  id: 'd1',
  kind: 'decision',
  label: 'Decide',
  position: { x: 0, y: 0 },
  data: {
    mode: 'branches',
    branches: [
      { id: 'yes', label: 'Yes', color: 'green' },
      { id: 'no', label: 'No', color: 'red' },
    ],
  },
}

describe('DecisionBranchesEditor', () => {
  it('adds a custom branch and can switch to switch mode', () => {
    const onChange = vi.fn()
    render(
      <DecisionBranchesEditor
        node={baseNode}
        edges={[]}
        onChange={onChange}
        onRemoveEdges={vi.fn()}
      />,
    )

    expect(screen.getAllByTestId('decision-branch')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Add branch' }))
    const next = onChange.mock.calls.at(-1)?.[0] as typeof baseNode
    expect(next.data.branches).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Switch on field' }))
    expect(onChange.mock.calls.at(-1)?.[0].data.mode).toBe('switch')
  })
})
