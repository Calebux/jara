import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { answer } from '@/lib/streak/service'
import { streakFailure } from '@/lib/streak/http'

export const dynamic = 'force-dynamic'

// { runId, index, choice } or { runId, index, timeout: true }. Scored against the server's clock.
export async function POST(req: Request) {
  try {
    const user = await requireUser()
    if (user instanceof NextResponse) return user
    const body = (await req.json().catch(() => ({}))) as { runId?: unknown; index?: unknown; choice?: unknown; timeout?: unknown }
    return NextResponse.json(await answer(user, body))
  } catch (err) { return streakFailure(err, 'streak-answer') }
}
