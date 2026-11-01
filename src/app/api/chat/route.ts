import { NextResponse } from 'next/server'
import { handleMessage, resolvePending } from '@/lib/agent'
import { run } from '@/lib/db'
import { requireUser } from '@/lib/session'
import { getUserById } from '@/lib/users'
import { bad, userState } from '../_shared'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await requireUser()
  if (user instanceof NextResponse) return user
  const body = (await req.json().catch(() => ({}))) as { text?: string; confirm?: boolean }
  let reply
  if (typeof body.confirm === 'boolean') {
    reply = await resolvePending(user.id, body.confirm)
    await run('INSERT INTO messages (user_id, role, content, created_at) VALUES (?, ?, ?, ?)', [user.id, 'assistant', reply.text, Date.now()])
  } else {
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : ''
    if (!text) return bad('Say something')
    reply = await handleMessage(user.id, text)
  }
  return NextResponse.json({ reply, state: await userState((await getUserById(user.id))!) })
}
