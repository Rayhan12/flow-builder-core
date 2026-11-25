import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { addMessage, listMessages, markMessageApplied, type DiagramMessage } from '../data/messages'
import { getUserSettings } from '../data/settings'
import { saveVersion } from '../data/versions'
import { autoLayoutDiagram } from '../editor/layout'
import type { Diagram } from '../schema'
import { useEditorStore } from '../store/editorStore'
import { createGeminiProvider } from './gemini'
import { forgetApiKey, getApiKey, hasApiKey, setApiKey } from './keyStorage'
import {
  parseAiResponseText,
  previewFromResponse,
  type AiResponse,
  type DiagramDiff,
} from './ops'
import { SYSTEM_PROMPT, buildPromptMessages } from './prompts'
import type { ChatMessage, LLMProvider } from './provider'

type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant-text'; text: string }
  | {
      id: string
      kind: 'proposal'
      text: string
      summary: string
      diff: DiagramDiff
      nextDiagram: Diagram
      messageId?: string
      applied: boolean
    }
  | { id: string; kind: 'error'; text: string }

type AssistantPanelProps = {
  open: boolean
  onClose: () => void
  diagramId: string
  providerFactory?: (apiKey: string, model: string) => LLMProvider
}

function diffCounts(diff: DiagramDiff) {
  return {
    added: diff.addedNodes.length + diff.addedEdges.length + (diff.titleChanged ? 0 : 0),
    changed: diff.changedNodes.length + diff.changedEdges.length + (diff.titleChanged ? 1 : 0),
    removed: diff.removedNodes.length + diff.removedEdges.length,
  }
}

export function AssistantPanel({
  open,
  onClose,
  diagramId,
  providerFactory = (apiKey, model) => createGeminiProvider({ apiKey, model }),
}: AssistantPanelProps) {
  const { user } = useAuth()
  const uid = user?.uid

  const diagram = useEditorStore((s) => s.diagram)
  const replaceDiagramContent = useEditorStore((s) => s.replaceDiagramContent)
  const undo = useEditorStore((s) => s.undo)

  const [items, setItems] = useState<ChatItem[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [model, setModel] = useState('gemini-2.5-flash')
  const [keyPresent, setKeyPresent] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const lastAppliedRef = useRef<string | null>(null)

  const refreshKey = useCallback(() => {
    if (!uid) return
    setKeyPresent(hasApiKey(uid))
  }, [uid])

  useEffect(() => {
    if (!open || !uid) return
    refreshKey()
    let cancelled = false
    void (async () => {
      try {
        const settings = await getUserSettings(uid)
        if (cancelled) return
        setModel(settings.aiModel)
        const messages = await listMessages(uid, diagramId)
        if (cancelled) return
        setItems(messagesToItems(messages))
        setLoadError(null)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not load chat history')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, uid, diagramId, refreshKey])

  useEffect(() => {
    if (!open) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items, open, busy])

  function onSaveKeyInline(e: FormEvent) {
    e.preventDefault()
    if (!uid) return
    setKeyError(null)
    try {
      setApiKey(uid, keyDraft)
      setKeyDraft('')
      setKeyPresent(true)
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Could not save key')
    }
  }

  async function sendPrompt(text: string) {
    if (!uid || !diagram || busy) return
    const trimmed = text.trim()
    if (!trimmed) return

    if (!hasApiKey(uid)) {
      setKeyPresent(false)
      return
    }

    const apiKey = getApiKey(uid)
    if (!apiKey) {
      setKeyPresent(false)
      return
    }

    setBusy(true)
    setDraft('')
    const userLocalId = localId('u')
    const userItem: ChatItem = { id: userLocalId, kind: 'user', text: trimmed }
    setItems((prev) => [...prev, userItem])

    try {
      await addMessage(uid, diagramId, { role: 'user', text: trimmed })

      const history: ChatMessage[] = items
        .filter((i) => i.kind === 'user' || i.kind === 'assistant-text' || i.kind === 'proposal')
        .map((i) => {
          if (i.kind === 'user') return { role: 'user' as const, text: i.text }
          if (i.kind === 'assistant-text') return { role: 'assistant' as const, text: i.text }
          return { role: 'assistant' as const, text: i.summary }
        })

      const provider = providerFactory(apiKey, model)
      const raw = await provider.generate({
        system: SYSTEM_PROMPT,
        messages: buildPromptMessages(diagram, history, trimmed),
      })

      const parsed = parseAiResponseText(raw)
      if (!parsed.ok) {
        setItems((prev) => [
          ...prev,
          { id: localId('e'), kind: 'error', text: parsed.error },
        ])
        await addMessage(uid, diagramId, {
          role: 'assistant',
          text: `Could not use that reply: ${parsed.error}`,
          applied: false,
        })
        return
      }

      await handleParsedResponse(uid, diagramId, diagram, parsed.value)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed'
      setItems((prev) => [
        ...prev,
        { id: localId('e'), kind: 'error', text: message },
      ])
    } finally {
      setBusy(false)
    }
  }

  async function handleParsedResponse(
    ownerId: string,
    dId: string,
    current: Diagram,
    response: AiResponse,
  ) {
    const preview = previewFromResponse(current, response)

    if (!preview.ok) {
      setItems((prev) => [
        ...prev,
        { id: localId('e'), kind: 'error', text: preview.error },
      ])
      await addMessage(ownerId, dId, {
        role: 'assistant',
        text: `Could not apply that reply: ${preview.error}`,
        applied: false,
      })
      return
    }

    if (preview.kind === 'message') {
      const saved = await addMessage(ownerId, dId, {
        role: 'assistant',
        text: preview.text,
        applied: false,
      })
      setItems((prev) => [
        ...prev,
        { id: saved.id, kind: 'assistant-text', text: preview.text },
      ])
      return
    }

    const ops = response.type === 'ops' ? response.ops : undefined
    const saved = await addMessage(ownerId, dId, {
      role: 'assistant',
      text: preview.diff.summary,
      ops,
      applied: false,
    })

    setItems((prev) => [
      ...prev,
      {
        id: saved.id,
        kind: 'proposal',
        text: preview.diff.summary,
        summary: preview.diff.summary,
        diff: preview.diff,
        nextDiagram: preview.diagram,
        messageId: saved.id,
        applied: false,
      },
    ])
  }

  async function onApply(item: Extract<ChatItem, { kind: 'proposal' }>) {
    if (!uid || item.applied) return
    let next = item.nextDiagram

    const missingPositions = next.nodes.some(
      (n, i) => i > 0 && n.position.x === 0 && n.position.y === 0,
    )
    if (missingPositions || next.nodes.every((n) => n.position.x === 0 && n.position.y === 0)) {
      try {
        const laidOut = await autoLayoutDiagram(next.nodes, next.edges, 'DOWN')
        next = { ...next, nodes: laidOut }
      } catch {
        // keep positions
      }
    }

    replaceDiagramContent(next)
    lastAppliedRef.current = item.id

    try {
      await saveVersion(uid, diagramId, next, 'ai-apply')
      if (item.messageId) {
        await markMessageApplied(uid, diagramId, item.messageId, true)
      }
    } catch {
      // version/history persistence is best-effort; diagram change already applied locally
    }

    setItems((prev) =>
      prev.map((i) => (i.id === item.id && i.kind === 'proposal' ? { ...i, applied: true } : i)),
    )
  }

  function onDiscard(itemId: string) {
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  function onUndoApply() {
    if (!lastAppliedRef.current) return
    undo()
    lastAppliedRef.current = null
  }

  if (!open) return null

  return (
    <aside className="ai-panel" aria-label="AI assistant">
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <Sparkles size={16} aria-hidden />
          <h2>Assistant</h2>
        </div>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Close assistant" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {!keyPresent ? (
        <div className="ai-key-card">
          <p className="ai-key-card-title">Add your Gemini API key to use the assistant</p>
          <p className="ai-key-card-hint">
            Your key stays in this browser. It is sent only to the AI provider you pick.
          </p>
          <form onSubmit={onSaveKeyInline} className="ai-key-form">
            <label className="field">
              <span>API key</span>
              <input
                type="password"
                autoComplete="off"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="Paste your Gemini API key"
                spellCheck={false}
              />
            </label>
            {keyError ? (
              <p className="form-error" role="alert">
                {keyError}
              </p>
            ) : null}
            <div className="ai-key-actions">
              <button type="submit" className="btn btn-primary" disabled={!keyDraft.trim()}>
                Save key
              </button>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="settings-link"
              >
                Get a key
              </a>
              <Link to="/settings" className="settings-link">
                Open settings
              </Link>
            </div>
          </form>
        </div>
      ) : null}

      <div className="ai-chat" ref={listRef}>
        {loadError ? (
          <p className="form-error" role="alert">
            {loadError}
          </p>
        ) : null}
        {items.length === 0 && keyPresent ? (
          <div className="ai-empty">
            <Sparkles size={32} className="ai-empty-icon" aria-hidden />
            <p className="ai-empty-title">Ask for a new flow or a change</p>
            <p className="ai-empty-hint">
              Example: Create a BNPL approval flow with credit check and merchant payout
            </p>
          </div>
        ) : null}
        {items.map((item) => {
          if (item.kind === 'user') {
            return (
              <div key={item.id} className="ai-bubble ai-bubble-user">
                {item.text}
              </div>
            )
          }
          if (item.kind === 'assistant-text') {
            return (
              <div key={item.id} className="ai-bubble ai-bubble-assistant">
                {item.text}
              </div>
            )
          }
          if (item.kind === 'error') {
            return (
              <div key={item.id} className="ai-bubble ai-bubble-error" role="alert">
                <p>{item.text}</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || !keyPresent}
                  onClick={() => {
                    const lastUser = [...items].reverse().find((i) => i.kind === 'user')
                    if (lastUser && lastUser.kind === 'user') void sendPrompt(lastUser.text)
                  }}
                >
                  Try again
                </button>
              </div>
            )
          }
          const counts = diffCounts(item.diff)
          return (
            <div key={item.id} className="ai-proposal">
              <p className="ai-proposal-summary">{item.summary}</p>
              <div className="ai-diff-chips">
                {counts.added > 0 ? (
                  <span className="ai-chip ai-chip-added">+{counts.added} added</span>
                ) : null}
                {counts.changed > 0 ? (
                  <span className="ai-chip ai-chip-changed">{counts.changed} changed</span>
                ) : null}
                {counts.removed > 0 ? (
                  <span className="ai-chip ai-chip-removed">{counts.removed} removed</span>
                ) : null}
              </div>
              {item.applied ? (
                <div className="ai-proposal-actions">
                  <span className="ai-applied-label">Applied</span>
                  <button type="button" className="btn btn-ghost" onClick={onUndoApply}>
                    Undo
                  </button>
                </div>
              ) : (
                <div className="ai-proposal-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void onApply(item)}
                  >
                    Apply changes
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => onDiscard(item.id)}>
                    Discard
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {busy ? (
          <div className="ai-bubble ai-bubble-assistant" role="status">
            Thinking...
          </div>
        ) : null}
      </div>

      <form
        className="ai-composer"
        onSubmit={(e) => {
          e.preventDefault()
          void sendPrompt(draft)
        }}
      >
        <label className="sr-only" htmlFor="ai-prompt">
          Message
        </label>
        <textarea
          id="ai-prompt"
          className="ai-composer-input"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={keyPresent ? 'Describe the flow or change...' : 'Add an API key first'}
          disabled={busy || !keyPresent}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void sendPrompt(draft)
            }
          }}
        />
        <div className="ai-composer-bar">
          {keyPresent ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (!uid) return
                forgetApiKey(uid)
                setKeyPresent(false)
              }}
            >
              Forget key
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !keyPresent || !draft.trim()}
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  )
}

function messagesToItems(messages: DiagramMessage[]): ChatItem[] {
  return messages.map((m) => {
    if (m.role === 'user') {
      return { id: m.id, kind: 'user', text: m.text }
    }
    if (m.applied) {
      return {
        id: m.id,
        kind: 'assistant-text',
        text: `${m.text} (applied)`,
      }
    }
    return { id: m.id, kind: 'assistant-text', text: m.text }
  })
}

let localSeq = 0
function localId(prefix: string): string {
  localSeq += 1
  return `local-${prefix}-${localSeq}`
}
