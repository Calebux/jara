import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/session'
import { setCampus } from '@/lib/streak/service'
import { streakFailure } from '@/lib/streak/http'

export const dynamic = 'force-dynamic'

// { campus }: rep a campus on the school leaderboard. Set once.
export async function POST(req: Request) {
  try {
    const user = await requireUser()
    if (user instanceof NextResponse) return user
    const body = (await req.json().catch(() => ({}))) as { campus?: unknown }
    return NextResponse.json(await setCampus(user, body.campus))
  } catch (err) { return streakFailure(err, 'streak-campus') }
}
