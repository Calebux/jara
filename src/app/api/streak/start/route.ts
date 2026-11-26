import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { startRun } from '@/lib/streak/service'
import { streakFailure } from '@/lib/streak/http'

export const dynamic = 'force-dynamic'

// Start a run (or resume the one in play). { campus? } joins a campus the first time.
export async function POST(req: Request) {
  try {
    const user = await requireUser()
    if (user instanceof NextResponse) return user
    const body = (await req.json().catch(() => ({}))) as { campus?: unknown }
    return NextResponse.json(await startRun(user, body))
  } catch (err) { return streakFailure(err, 'streak-start') }
}
