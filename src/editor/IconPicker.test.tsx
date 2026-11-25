import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconPicker } from './IconPicker'

describe('IconPicker', () => {
  it('opens, searches, and selects an icon', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<IconPicker value="layers" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Choose icon' }))
    const search = screen.getByLabelText('Search icons')
    await user.clear(search)
    await user.type(search, 'shield')

    const option = await screen.findByRole('option', { name: 'shield' })
    await user.click(option)
    expect(onChange).toHaveBeenCalledWith('shield')
  })
})
