import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryDataPort } from '../../shared/tools/memoryPort'
import { executeTool } from '../../shared/tools'
import { forgetApiKey, setApiKey } from '../ai/keyStorage'
import { ThemeProvider } from '../theme/ThemeProvider'
import { AgentPanel, type AgentPanelProps } from './AgentPanel'
import type { GenerateWithToolsOptions } from './geminiTools'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'demo@example.com' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    signInWithGoogle: vi.fn(),
    resetPassword: vi.fn(),
  }),
}))

vi.mock('./browserDataPort', () => ({ createBrowserDataPort: vi.fn() }))

vi.mock('../data/settings', () => ({
  getUserSettings: vi.fn().mockResolvedValue({
    theme: 'light',
    aiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
  }),
}))

const chats = vi.hoisted(() => ({
  listAgentChats: vi.fn(),
  listAgentChatMessages: vi.fn(),
  createAgentChat: vi.fn(),
  addAgentChatMessage: vi.fn(),
}))

vi.mock('../data/agentChats', () => ({
  ...chats,
  titleFromText: (t: string) => t.slice(0, 80),
}))

type Generate = NonNullable<AgentPanelProps['generate']>

function renderPanel(props: Partial<AgentPanelProps> & { generate?: Generate } = {}) {
  const port = createMemoryDataPort()
  const utils = render(
    <ThemeProvider>
      <MemoryRouter>
        <AgentPanel
          open
          onClose={props.onClose ?? (() => undefined)}
          createPort={() => port}
          {...props}
        />
      </MemoryRouter>
    </ThemeProvider>,
  )
  return { port, ...utils }
}

/** A generate stub that creates a project and diagram through the real tools. */
function createFlowGenerate(): Generate {
  return async (opts: GenerateWithToolsOptions) => {
    const project = await executeTool('create_project', { name: 'Lending' }, opts.port)
    if (!project.ok) throw new Error('setup failed')
    const projectId = (project.data as { id: string }).id
    opts.onToolCall?.({ id: 'c1', name: 'create_diagram', args: {}, status: 'running' })
    const created = await executeTool(
      'create_diagram',
      { projectId, title: 'Refund flow' },
      opts.port,
    )
    const call = {
      id: 'c1',
      name: 'create_diagram',
      args: { projectId, title: 'Refund flow' },
      status: 'done' as const,
      result: created,
      openPath: created.ok ? created.openPath : undefined,
    }
    opts.onToolCall?.(call)
    return { text: 'I created the Refund flow.', toolCalls: [call], steps: 2 }
  }
}

describe('AgentPanel', () => {
  beforeEach(() => {
    forgetApiKey('u1')
    chats.listAgentChats.mockReset().mockResolvedValue([])
    chats.listAgentChatMessages.mockReset().mockResolvedValue([])
    chats.createAgentChat
      .mockReset()
      .mockResolvedValue({ id: 'c_1', title: 'New chat', messageCount: 0, createdAt: null, updatedAt: null })
    chats.addAgentChatMessage.mockReset().mockResolvedValue({})
  })

  it('shows the key card inline and unlocks the composer after saving a key', async () => {
    const user = userEvent.setup()
    renderPanel()

    expect(screen.getByText(/add your gemini api key/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open settings/i })).toHaveAttribute('href', '/settings')
    expect(screen.getByLabelText('Message')).toBeDisabled()

    await user.type(screen.getByLabelText('API key'), 'secret-key')
    await user.click(screen.getByRole('button', { name: /save key/i }))

    await waitFor(() => expect(screen.getByLabelText('Message')).toBeEnabled())
    expect(screen.queryByText(/add your gemini api key/i)).not.toBeInTheDocument()
  })

  it('runs a prompt, shows a tool call card with an Open link and saves the chat', async () => {
    setApiKey('u1', 'secret-key')
    const user = userEvent.setup()
    const onDataChanged = vi.fn()
    const generate = vi.fn(createFlowGenerate())
    const { port } = renderPanel({ generate, onDataChanged })

    await user.type(screen.getByLabelText('Message'), 'Create a refund flow')
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    expect(await screen.findByText('I created the Refund flow.')).toBeInTheDocument()
    const card = screen.getByTestId('tool-call-card')
    expect(within(card).getByText('create_diagram')).toBeInTheDocument()
    expect(within(card).getByText(/created diagram "refund flow"/i)).toBeInTheDocument()
    const open = within(card).getByRole('link', { name: /open/i })
    const projectId = (await port.listProjects())[0].id
    expect(open.getAttribute('href')).toMatch(new RegExp(`^/p/${projectId}/d/d_`))

    expect(generate.mock.calls[0][0]).toMatchObject({
      apiKey: 'secret-key',
      model: 'gemini-2.5-flash',
      userText: 'Create a refund flow',
    })
    expect(onDataChanged).toHaveBeenCalledOnce()

    await waitFor(() => expect(chats.addAgentChatMessage).toHaveBeenCalledTimes(2))
    const [, , userMsg] = chats.addAgentChatMessage.mock.calls[0]
    const [, , assistantMsg] = chats.addAgentChatMessage.mock.calls[1]
    expect(userMsg).toMatchObject({ role: 'user', text: 'Create a refund flow' })
    expect(assistantMsg).toMatchObject({ role: 'assistant', text: 'I created the Refund flow.' })
    expect(assistantMsg.toolCalls[0]).toMatchObject({ name: 'create_diagram', status: 'done' })
    expect(chats.createAgentChat).toHaveBeenCalledOnce()
  })

  it('sends initialPrompt automatically and starts a fresh chat', async () => {
    setApiKey('u1', 'secret-key')
    const generate = vi.fn(createFlowGenerate())
    renderPanel({ generate, initialPrompt: 'Build a KYC flow', initialProjectId: 'p_x' })

    expect(await screen.findByText('I created the Refund flow.')).toBeInTheDocument()
    expect(generate).toHaveBeenCalledOnce()
    expect(generate.mock.calls[0][0].userText).toBe('Build a KYC flow')
    expect(generate.mock.calls[0][0].system).toContain('p_x')
    expect(chats.listAgentChats).not.toHaveBeenCalled()
  })

  it('holds initialPrompt until a key is saved, then sends it once', async () => {
    const user = userEvent.setup()
    const generate = vi.fn(createFlowGenerate())
    renderPanel({ generate, initialPrompt: 'Build a KYC flow' })

    await screen.findByText(/add your gemini api key/i)
    expect(generate).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('API key'), 'secret-key')
    await user.click(screen.getByRole('button', { name: /save key/i }))

    expect(await screen.findByText('I created the Refund flow.')).toBeInTheDocument()
    expect(generate).toHaveBeenCalledOnce()
  })

  it('limits tools in create mode', async () => {
    setApiKey('u1', 'secret-key')
    const generate = vi.fn(createFlowGenerate())
    renderPanel({ generate, mode: 'create', variant: 'dialog', initialPrompt: 'A flow' })
    await screen.findByText('I created the Refund flow.')
    const tools = generate.mock.calls[0][0].tools
    expect(tools).toContain('create_diagram')
    expect(tools).not.toContain('delete_diagram')
    expect(tools).not.toContain('create_project')
    expect(screen.getByRole('dialog', { name: /ai agent/i })).toBeInTheDocument()
  })

  it('asks for confirmation before a destructive tool and respects Cancel', async () => {
    setApiKey('u1', 'secret-key')
    const user = userEvent.setup()
    let outcome: boolean | undefined
    const generate: Generate = async (opts) => {
      outcome = await opts.confirmDestructive?.({
        name: 'delete_diagram',
        args: { projectId: 'p', diagramId: 'd', confirm: true },
      })
      return { text: outcome ? 'Deleted.' : 'Okay, I left it.', toolCalls: [], steps: 1 }
    }
    renderPanel({ generate })

    await user.type(screen.getByLabelText('Message'), 'delete my diagram')
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(await screen.findByText('Okay, I left it.')).toBeInTheDocument()
    expect(outcome).toBe(false)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('approves a destructive tool with Delete', async () => {
    setApiKey('u1', 'secret-key')
    const user = userEvent.setup()
    const generate: Generate = async (opts) => {
      const ok = await opts.confirmDestructive?.({ name: 'delete_diagram', args: {} })
      return { text: ok ? 'Deleted.' : 'No.', toolCalls: [], steps: 1 }
    }
    renderPanel({ generate })
    await user.type(screen.getByLabelText('Message'), 'delete it')
    await user.click(screen.getByRole('button', { name: /^send$/i }))
    await user.click(await screen.findByRole('button', { name: /^delete$/i }))
    expect(await screen.findByText('Deleted.')).toBeInTheDocument()
  })

  it('loads the latest chat history on open', async () => {
    setApiKey('u1', 'secret-key')
    chats.listAgentChats.mockResolvedValue([
      { id: 'c_old', title: 'Old', messageCount: 2, createdAt: null, updatedAt: null },
    ])
    chats.listAgentChatMessages.mockResolvedValue([
      { id: 'm1', role: 'user', text: 'Earlier question', toolCalls: [], createdAt: null },
      {
        id: 'm2',
        role: 'assistant',
        text: 'Earlier answer',
        createdAt: null,
        toolCalls: [
          {
            id: 't1',
            name: 'create_project',
            argsPreview: '{}',
            status: 'done',
            summary: 'Created project "Old"',
            openPath: '/p/p_old',
          },
        ],
      },
    ])
    renderPanel()

    expect(await screen.findByText('Earlier question')).toBeInTheDocument()
    expect(screen.getByText('Earlier answer')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open project/i })).toHaveAttribute('href', '/p/p_old')
  })

  it('shows an error bubble when the model call fails', async () => {
    setApiKey('u1', 'secret-key')
    const user = userEvent.setup()
    renderPanel({
      generate: async () => {
        throw new Error('API key not valid')
      },
    })
    await user.type(screen.getByLabelText('Message'), 'hi')
    await user.click(screen.getByRole('button', { name: /^send$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('API key not valid')
  })

  it('keeps working when chat history cannot be saved', async () => {
    setApiKey('u1', 'secret-key')
    chats.createAgentChat.mockRejectedValue(new Error('permission-denied'))
    const user = userEvent.setup()
    renderPanel({ generate: createFlowGenerate() })
    await user.type(screen.getByLabelText('Message'), 'hi')
    await user.click(screen.getByRole('button', { name: /^send$/i }))
    expect(await screen.findByText('I created the Refund flow.')).toBeInTheDocument()
    expect(await screen.findByText(/chat history could not be saved/i)).toBeInTheDocument()
  })
})
