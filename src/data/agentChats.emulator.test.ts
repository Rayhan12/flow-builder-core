/**
 * Runs only when the Auth and Firestore emulators are up.
 */
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auth } from '../lib/firebase'
import {
  addAgentChatMessage,
  createAgentChat,
  deleteAgentChat,
  getAgentChat,
  listAgentChatMessages,
  listAgentChats,
} from './agentChats'

const run = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST)

describe.skipIf(!run)('Agent chats repo (emulator)', () => {
  let uid: string

  beforeAll(async () => {
    const cred = await createUserWithEmailAndPassword(
      auth,
      `agent-chats-${Date.now()}@example.com`,
      'test-pass-123',
    )
    uid = cred.user.uid
  })

  afterAll(async () => {
    await signOut(auth)
  })

  it('stores messages with compact tool calls and names the chat from the first prompt', async () => {
    const chat = await createAgentChat(uid)
    expect(chat.title).toBe('New chat')

    await addAgentChatMessage(uid, chat.id, { role: 'user', text: 'Create a refund flow in Lending' })
    await addAgentChatMessage(uid, chat.id, {
      role: 'assistant',
      text: 'Done.',
      toolCalls: [
        {
          id: 'call-1',
          name: 'create_diagram',
          argsPreview: '{"projectId":"p_1"}',
          status: 'done',
          summary: 'Created diagram "Refund"',
          openPath: '/p/p_1/d/d_1',
          mutated: true,
        },
        { id: 'call-2', name: 'delete_diagram', argsPreview: '{}', status: 'declined', summary: '', error: 'The user declined' },
      ],
    })

    const messages = await listAgentChatMessages(uid, chat.id)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(messages[1].toolCalls).toHaveLength(2)
    expect(messages[1].toolCalls[0]).toMatchObject({ name: 'create_diagram', openPath: '/p/p_1/d/d_1' })
    expect(messages[1].toolCalls[1]).toMatchObject({ status: 'declined', error: 'The user declined' })

    const reloaded = await getAgentChat(uid, chat.id)
    expect(reloaded?.title).toBe('Create a refund flow in Lending')
    expect(reloaded?.messageCount).toBe(2)
  })

  it('lists newest chats first and deletes a chat with its messages', async () => {
    const older = await createAgentChat(uid, 'Older chat')
    await new Promise((r) => setTimeout(r, 30))
    const newer = await createAgentChat(uid, 'Newer chat')
    await addAgentChatMessage(uid, newer.id, { role: 'user', text: 'hello' })

    const list = await listAgentChats(uid, 10)
    const ids = list.map((c) => c.id)
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id))

    await deleteAgentChat(uid, newer.id)
    expect(await getAgentChat(uid, newer.id)).toBeNull()
    expect(await listAgentChatMessages(uid, newer.id)).toEqual([])
  })
})
