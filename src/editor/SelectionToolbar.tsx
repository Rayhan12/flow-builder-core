import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BetweenHorizonalStart,
  BetweenVerticalStart,
  LayoutGrid,
} from 'lucide-react'
import type { AlignMode, DistributeAxis } from './arrange'

type Props = {
  count: number
  onAlign: (mode: AlignMode) => void
  onDistribute: (axis: DistributeAxis) => void
  onTidy: () => void
}

const ALIGN_BUTTONS: Array<{ mode: AlignMode; label: string; Icon: typeof AlignStartHorizontal }> = [
  { mode: 'left', label: 'Align left', Icon: AlignStartVertical },
  { mode: 'center', label: 'Align centre', Icon: AlignCenterVertical },
  { mode: 'right', label: 'Align right', Icon: AlignEndVertical },
  { mode: 'top', label: 'Align top', Icon: AlignStartHorizontal },
  { mode: 'middle', label: 'Align middle', Icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal },
]

export function SelectionToolbar({ count, onAlign, onDistribute, onTidy }: Props) {
  if (count < 2) return null

  return (
    <div className="selection-toolbar" role="toolbar" aria-label="Arrange selection" data-testid="align-toolbar">
      <span className="selection-toolbar-count">{count} selected</span>
      <span className="selection-toolbar-divider" aria-hidden />
      {ALIGN_BUTTONS.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={label}
          title={label}
          data-testid={`align-${mode}`}
          onClick={() => onAlign(mode)}
        >
          <Icon size={16} />
        </button>
      ))}
      <span className="selection-toolbar-divider" aria-hidden />
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label="Distribute horizontally"
        title="Distribute horizontally"
        data-testid="distribute-horizontal"
        disabled={count < 3}
        onClick={() => onDistribute('horizontal')}
      >
        <BetweenHorizonalStart size={16} />
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label="Distribute vertically"
        title="Distribute vertically"
        data-testid="distribute-vertical"
        disabled={count < 3}
        onClick={() => onDistribute('vertical')}
      >
        <BetweenVerticalStart size={16} />
      </button>
      <span className="selection-toolbar-divider" aria-hidden />
      <button
        type="button"
        className="btn btn-ghost"
        aria-label="Tidy up"
        title="Tidy up"
        data-testid="tidy-up"
        onClick={onTidy}
      >
        <LayoutGrid size={14} aria-hidden />
        Tidy up
      </button>
    </div>
  )
}
