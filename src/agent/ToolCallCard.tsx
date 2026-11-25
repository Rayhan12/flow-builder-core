import { AlertTriangle, Check, Loader2, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StoredToolCall } from '../data/agentChats'

export type ToolCardData = Omit<StoredToolCall, 'status'> & {
  status: StoredToolCall['status'] | 'running'
}

type ToolCallCardProps = {
  call: ToolCardData
  /** Called when the Open link is clicked (the dialog variant closes itself). */
  onOpen?: () => void
}

const STATUS_LABEL: Record<ToolCardData['status'], string> = {
  running: 'Running',
  done: 'Done',
  error: 'Failed',
  declined: 'Declined',
}

function openLabel(path: string): string {
  return path.includes('/d/') ? 'Open diagram' : 'Open project'
}

export function ToolCallCard({ call, onOpen }: ToolCallCardProps) {
  const detail = call.status === 'error' || call.status === 'declined' ? call.error : call.summary
  return (
    <div className={`agent-tool agent-tool-${call.status}`} data-testid="tool-call-card">
      <div className="agent-tool-head">
        <span className="agent-tool-icon" aria-hidden>
          {call.status === 'running' ? (
            <Loader2 size={14} className="agent-spin" />
          ) : call.status === 'done' ? (
            <Check size={14} />
          ) : call.status === 'error' ? (
            <AlertTriangle size={14} />
          ) : (
            <Wrench size={14} />
          )}
        </span>
        <code className="agent-tool-name">{call.name}</code>
        <span className="agent-tool-status">{STATUS_LABEL[call.status]}</span>
      </div>
      {detail ? <p className="agent-tool-summary">{detail}</p> : null}
      {call.openPath && call.status === 'done' ? (
        <Link to={call.openPath} className="agent-tool-open" onClick={onOpen}>
          {openLabel(call.openPath)}
        </Link>
      ) : null}
    </div>
  )
}
