/**
 * AI agent panel (docs/PLAN.md section 16).
 *
 * Integration points for the dashboard and the sidebar:
 *  - Dashboard "Ask AI":   <AgentPanel open onClose initialPrompt="..." initialProjectId="p_..." variant="dialog" />
 *  - Sidebar "AI create":  <AiCreateFlow open onClose initialProjectId="p_..." />   (a dialog, new chat each time)
 *  - App wide:             wrap routes in <AgentPanelProvider> and call useAgentPanel().openAgent({ prompt, projectId })
 *  - Refresh lists:        pass onDataChanged to reload projects and diagrams after the agent changed data.
 * All of these are exported from `src/agent/index.ts`. The panel needs AuthProvider and a Router above it.
 */
import { Clock, MessageSquarePlus, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type DataPort } from '../../shared/tools'
import { MissingKeyCard } from '../ai/components/MissingKeyCard'
import { ModelSwitcher } from '../ai/components/ModelSwitcher'
import { hasApiKey } from '../ai/keyStorage'
import { getConnection, listConnections, removeConnection } from '../ai/providers/connections'
import { getModelCache } from '../ai/providers/modelCache'
import {
  resolveActiveSelection,
  setSelectedModel,
  type SelectedModelRef,
} from '../ai/providers/selectedModel'
import { useAuth } from '../auth/useAuth'
import {
  addAgentChatMessage,
  createAgentChat,
  listAgentChatMessages,
  listAgentChats,
  type AgentChat,
  type AgentChatMessage,
  titleFromText,
  type StoredToolCall,
} from '../data/agentChats'
import { createBrowserDataPort } from './browserDataPort'
import {
  generateWithTools,
  type AgentChatTurn,
  type AgentToolCall,
  type GenerateWithToolsOptions,
} from './geminiTools'
import { CREATE_FLOW_TOOLS, buildAgentSystemPrompt, type AgentMode } from './prompts'
import { ToolCallCard, type ToolCardData } from './ToolCallCard'
import './agent.css'

export type AgentPanelProps = {
  open: boolean
  onClose: () => void
  /** Sent automatically once the panel opens (or after the key is saved). Starts a new chat. */
  initialPrompt?: string
  /** Project the user is looking at. Passed to the model as the default project. */
  initialProjectId?: string
  /** `agent` is the general panel; `create` limits tools and starts a fresh chat. */
  mode?: AgentMode
  /** `drawer` is a 380px right drawer; `dialog` is a centred modal. */
  variant?: 'drawer' | 'dialog'
  /** Called after a tool changed stored data, so lists can refresh. */
  onDataChanged?: () => void
  /** Test and customisation seams. */
  generate?: (opts: GenerateWithToolsOptions) => ReturnType<typeof generateWithTools>
  createPort?: (uid: string) => DataPort
}

type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string; toolCalls: ToolCardData[] }
  | { id: string; kind: 'error'; text: string }

type ConfirmRequest = {
  name: string
  label: string
  resolve: (approved: boolean) => void
}

const MAX_ARGS_PREVIEW = 400
const MAX_HISTORY_TURNS = 20

let localSeq = 0
function localId(prefix: string): string {
  localSeq += 1
  return `local-${prefix}-${localSeq}`
}

function argsPreview(args: unknown): string {
  let text = ''
  try {
    text = JSON.stringify(args) ?? ''
  } catch {
    text = ''
  }
  return text.length > MAX_ARGS_PREVIEW ? `${text.slice(0, MAX_ARGS_PREVIEW)}...` : text
}

function toCard(call: AgentToolCall): ToolCardData {
  const base = { id: call.id, name: call.name, argsPreview: argsPreview(call.args) }
  if (call.status === 'running' || !call.result) {
    return { ...base, status: 'running', summary: '' }
  }
  if (call.result.ok) {
    return {
      ...base,
      status: 'done',
      summary: call.result.summary,
      openPath: call.result.openPath,
      mutated: call.result.mutated,
    }
  }
  return {
    ...base,
    status: call.result.code === 'declined' ? 'declined' : 'error',
    summary: '',
    error: call.result.error,
  }
}

function toStored(card: ToolCardData): StoredToolCall {
  return { ...card, status: card.status === 'running' ? 'error' : card.status }
}

function messageToItem(m: AgentChatMessage): ChatItem {
  if (m.role === 'user') return { id: m.id, kind: 'user', text: m.text }
  return { id: m.id, kind: 'assistant', text: m.text, toolCalls: m.toolCalls }
}

/** Text the model sees for an earlier turn. Tool lines keep ids available across turns. */
function itemToTurn(item: ChatItem): AgentChatTurn | null {
  if (item.kind === 'user') return { role: 'user', text: item.text }
  if (item.kind === 'assistant') {
    const lines = item.toolCalls.map(
      (c) =>
        `- ${c.name}(${c.argsPreview}) => ${c.status === 'done' ? c.summary : (c.error ?? c.status)}${c.openPath ? ` [${c.openPath}]` : ''}`,
    )
    const text = lines.length ? `${item.text}\n\nTools used:\n${lines.join('\n')}` : item.text
    return { role: 'assistant', text }
  }
  return null
}

export function AgentPanel(props: AgentPanelProps) {
  if (!props.open) return null
  return <AgentPanelBody {...props} />
}

function AgentPanelBody({
  onClose,
  initialPrompt,
  initialProjectId,
  mode = 'agent',
  variant = 'drawer',
  onDataChanged,
  generate = generateWithTools,
  createPort,
}: AgentPanelProps) {
  const { user } = useAuth()
  const uid = user?.uid

  const [items, setItems] = useState<ChatItem[]>([])
  const [liveCalls, setLiveCalls] = useState<ToolCardData[]>([])
  const [draft, setDraft] = useState(initialPrompt ?? '')
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<SelectedModelRef | null>(() =>
    uid ? resolveActiveSelection(uid) : null,
  )
  const [keyReady, setKeyReady] = useState(() => Boolean(uid && hasApiKey(uid)))
  const [modelRevision, setModelRevision] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [chat, setChat] = useState<AgentChat | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<AgentChat[]>([])
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [ready, setReady] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<AgentChat | null>(null)
  const itemsRef = useRef<ChatItem[]>([])
  const pendingPromptRef = useRef<string | null>(initialPrompt?.trim() || null)
  const confirmRef = useRef<ConfirmRequest | null>(null)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const projectNameRef = useRef<string | null>(null)

  useEffect(() => {
    itemsRef.current = items
  }, [items])
  useEffect(() => {
    confirmRef.current = confirm
  }, [confirm])

  const port = useMemo<DataPort | null>(() => {
    if (!uid) return null
    if (createPort) return createPort(uid)
    return createBrowserDataPort(uid, {
      layout: async (nodes, edges) =>
        (await import('../editor/layout')).autoLayoutDiagram(nodes, edges, 'DOWN'),
    })
  }, [uid, createPort])

  // Initial load: settings, project name and (for the general panel) the latest chat.
  useEffect(() => {
    if (!uid || !port) return
    let cancelled = false
    void (async () => {
      if (!cancelled) {
        setSelection(resolveActiveSelection(uid))
        setKeyReady(hasApiKey(uid))
      }
      if (initialProjectId) {
        try {
          const project = await port.getProject(initialProjectId)
          projectNameRef.current = project?.name ?? null
        } catch {
          projectNameRef.current = null
        }
      }
      if (mode === 'agent' && !initialPrompt?.trim()) {
        try {
          const [latest] = await listAgentChats(uid, 1)
          if (latest && !cancelled) {
            const messages = await listAgentChatMessages(uid, latest.id)
            if (cancelled) return
            chatRef.current = latest
            setChat(latest)
            setItems(messages.map(messageToItem))
          }
        } catch (err) {
          if (!cancelled) setNotice(historyNotice(err))
        }
      }
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
    // Run once per open; the body remounts on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, port])

  // Resolve a pending confirm as declined if the panel goes away.
  useEffect(
    () => () => {
      confirmRef.current?.resolve(false)
    },
    [],
  )

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items, liveCalls, busy, confirm])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (confirmRef.current) {
        confirmRef.current.resolve(false)
        setConfirm(null)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function askConfirm(name: string, args: unknown): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      void (async () => {
        let label = 'this item'
        const a = (args ?? {}) as { projectId?: string; diagramId?: string }
        if (port && name === 'delete_diagram' && a.projectId && a.diagramId) {
          try {
            const found = await port.getDiagram(a.projectId, a.diagramId)
            if (found) label = `the diagram "${found.title}"`
          } catch {
            // fall back to the generic label
          }
        }
        setConfirm({
          name,
          label,
          resolve: (approved) => {
            setConfirm(null)
            resolve(approved)
          },
        })
      })()
    })
  }

  async function ensureChat(): Promise<AgentChat | null> {
    if (chatRef.current) return chatRef.current
    if (!uid) return null
    try {
      const created = await createAgentChat(uid)
      chatRef.current = created
      setChat(created)
      return created
    } catch (err) {
      setNotice(historyNotice(err))
      return null
    }
  }

  /** Saves run one after another so the first message always creates the chat first. */
  function persist(role: 'user' | 'assistant', text: string, toolCalls?: StoredToolCall[]): void {
    queueRef.current = queueRef.current.then(async () => {
      if (!uid) return
      const current = await ensureChat()
      if (!current) return
      try {
        await addAgentChatMessage(uid, current.id, { role, text, toolCalls }, current)
        const next: AgentChat = {
          ...current,
          messageCount: current.messageCount + 1,
          title: role === 'user' && current.title === 'New chat' ? titleFromText(text) : current.title,
        }
        chatRef.current = next
        setChat(next)
      } catch (err) {
        setNotice(historyNotice(err))
      }
    })
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!uid || !port || busy || !trimmed) return
    const active = selection ?? resolveActiveSelection(uid)
    const conn = active ? getConnection(uid, active.connectionId) : null
    if (!active || !conn) {
      pendingPromptRef.current = trimmed
      setKeyReady(false)
      return
    }

    setBusy(true)
    setDraft('')
    setLiveCalls([])
    const turns = itemsRef.current
      .slice(-MAX_HISTORY_TURNS)
      .map(itemToTurn)
      .filter((t): t is AgentChatTurn => t !== null)
    setItems((prev) => [...prev, { id: localId('u'), kind: 'user', text: trimmed }])
    persist('user', trimmed)

    const cache = getModelCache(uid, conn.id)
    const modelStatus = cache?.models.find((m) => m.id === active.model)
    const live = new Map<string, ToolCardData>()
    try {
      const result = await generate({
        apiKey: conn.apiKey,
        model: active.model,
        connection: conn,
        supportsTools: modelStatus?.supportsTools ?? true,
        system: buildAgentSystemPrompt({
          mode,
          project:
            initialProjectId && projectNameRef.current
              ? { id: initialProjectId, name: projectNameRef.current }
              : initialProjectId
                ? { id: initialProjectId, name: initialProjectId }
                : null,
        }),
        history: turns,
        userText: trimmed,
        port,
        tools: mode === 'create' ? CREATE_FLOW_TOOLS : undefined,
        confirmDestructive: ({ name, args }) => askConfirm(name, args),
        onToolCall: (call) => {
          live.set(call.id, toCard(call))
          setLiveCalls([...live.values()])
        },
      })
      const cards = result.toolCalls.map(toCard)
      setLiveCalls([])
      setItems((prev) => [
        ...prev,
        { id: localId('a'), kind: 'assistant', text: result.text, toolCalls: cards },
      ])
      persist('assistant', result.text, cards.map(toStored))
      if (cards.some((c) => c.status === 'done' && c.mutated)) onDataChanged?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed'
      const cards = [...live.values()]
      setLiveCalls([])
      setItems((prev) => [
        ...prev,
        ...(cards.length
          ? [{ id: localId('a'), kind: 'assistant' as const, text: '', toolCalls: cards }]
          : []),
        { id: localId('e'), kind: 'error', text: message },
      ])
      if (cards.some((c) => c.status === 'done' && c.mutated)) onDataChanged?.()
    } finally {
      setBusy(false)
    }
  }

  // Send the initial prompt once everything is ready and a key exists. It is
  // cleared before sending, so a key saved later never sends it twice.
  useEffect(() => {
    if (!ready || !keyReady || busy) return
    const pending = pendingPromptRef.current
    if (!pending) return
    pendingPromptRef.current = null
    void send(pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, keyReady])

  function startNewChat() {
    if (busy) return
    chatRef.current = null
    setChat(null)
    setItems([])
    setLiveCalls([])
    setHistoryOpen(false)
    setNotice(null)
  }

  async function toggleHistory() {
    if (!uid) return
    const next = !historyOpen
    setHistoryOpen(next)
    if (!next) return
    try {
      setHistory(await listAgentChats(uid, 20))
    } catch (err) {
      setNotice(historyNotice(err))
    }
  }

  async function loadChat(target: AgentChat) {
    if (!uid || busy) return
    try {
      const messages = await listAgentChatMessages(uid, target.id)
      chatRef.current = target
      setChat(target)
      setItems(messages.map(messageToItem))
      setHistoryOpen(false)
      setNotice(null)
    } catch (err) {
      setNotice(historyNotice(err))
    }
  }

  const empty = items.length === 0 && !busy
  const canSend = keyReady && !busy && Boolean(draft.trim())
  const closeOnOpen = variant === 'dialog' ? onClose : undefined

  const panel = (
    <aside
      className={`agent-panel agent-panel-${variant}`}
      aria-label="AI agent"
      role={variant === 'dialog' ? 'dialog' : 'complementary'}
      aria-modal={variant === 'dialog' ? true : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <Sparkles size={16} aria-hidden />
          <h2>{mode === 'create' ? 'Create with AI' : 'AI agent'}</h2>
        </div>
        <div className="agent-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Chat history"
            aria-expanded={historyOpen}
            onClick={() => void toggleHistory()}
          >
            <Clock size={16} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="New chat"
            disabled={busy}
            onClick={startNewChat}
          >
            <MessageSquarePlus size={16} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close agent" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      {historyOpen ? (
        <div className="agent-history" role="list" aria-label="Previous chats">
          {history.length === 0 ? (
            <p className="agent-history-empty">No earlier chats yet.</p>
          ) : (
            history.map((c) => (
              <button
                key={c.id}
                type="button"
                role="listitem"
                className={`agent-history-item${chat?.id === c.id ? ' is-active' : ''}`}
                onClick={() => void loadChat(c)}
              >
                <span className="agent-history-title">{c.title}</span>
                <span className="agent-history-meta">
                  {c.updatedAt ? c.updatedAt.toLocaleDateString() : ''}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {!keyReady && uid ? (
        <MissingKeyCard
          uid={uid}
          compact
          onReady={() => {
            setKeyReady(true)
            setSelection(resolveActiveSelection(uid))
            setModelRevision((n) => n + 1)
          }}
        />
      ) : null}

      {keyReady && uid ? (
        <div className="ai-panel-model-row">
          <ModelSwitcher
            uid={uid}
            value={selection}
            revision={modelRevision}
            onChange={(ref) => {
              setSelection(ref)
              setSelectedModel(uid, ref)
            }}
          />
        </div>
      ) : null}

      <div className="ai-chat" ref={listRef}>
        {notice ? (
          <p className="agent-notice" role="status">
            {notice}
          </p>
        ) : null}
        {empty ? (
          <div className="ai-empty">
            <Sparkles size={40} className="ai-empty-icon" strokeWidth={1.5} aria-hidden />
            <p className="ai-empty-title">
              {mode === 'create' ? 'Describe the flow you want' : 'Ask me to build or change flows'}
            </p>
            <p className="ai-empty-hint">
              {mode === 'create'
                ? 'Example: Create a BNPL approval flow with credit check and merchant payout'
                : 'Example: Create a project called Lending, then add a refund approval flow to it'}
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
          if (item.kind === 'error') {
            return (
              <div key={item.id} className="ai-bubble ai-bubble-error" role="alert">
                <p>{item.text}</p>
              </div>
            )
          }
          return (
            <div key={item.id} className="agent-turn">
              {item.toolCalls.map((c) => (
                <ToolCallCard key={c.id} call={c} onOpen={closeOnOpen} />
              ))}
              {item.text ? <div className="ai-bubble ai-bubble-assistant">{item.text}</div> : null}
            </div>
          )
        })}

        {busy ? (
          <div className="agent-turn">
            {liveCalls.map((c) => (
              <ToolCallCard key={c.id} call={c} />
            ))}
            <div className="ai-bubble ai-bubble-assistant" role="status">
              Thinking...
            </div>
          </div>
        ) : null}
      </div>

      <form
        className="ai-composer"
        onSubmit={(e) => {
          e.preventDefault()
          void send(draft)
        }}
      >
        <label className="sr-only" htmlFor="agent-prompt">
          Message
        </label>
        <textarea
          id="agent-prompt"
          className="ai-composer-input"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={keyReady ? 'Ask the agent...' : 'Add an API key first'}
          disabled={busy || !keyReady}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(draft)
            }
          }}
        />
        <div className="ai-composer-bar">
          {keyReady ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (!uid) return
                for (const c of listConnections(uid)) removeConnection(uid, c.id)
                setKeyReady(false)
                setSelection(null)
                setModelRevision((n) => n + 1)
              }}
            >
              Forget keys
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="btn btn-primary" disabled={!canSend}>
            Send
          </button>
        </div>
      </form>

      {confirm ? (
        <div className="dialog-backdrop agent-confirm-backdrop" role="presentation">
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="agent-confirm-title"
            aria-describedby="agent-confirm-body"
          >
            <h2 id="agent-confirm-title">Delete diagram?</h2>
            <p id="agent-confirm-body" className="dialog-body">
              The agent wants to delete {confirm.label}. This cannot be undone.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => confirm.resolve(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => confirm.resolve(true)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  )

  if (variant === 'dialog') {
    return (
      <div className="dialog-backdrop" role="presentation" onClick={onClose}>
        {panel}
      </div>
    )
  }
  return panel
}

function historyNotice(err: unknown): string {
  const detail = err instanceof Error ? ` (${err.message})` : ''
  return `Chat history could not be saved or loaded${detail}. The agent still works.`
}
