import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { leaderboard } from '@/lib/streak/service'
import { streakFailure } from '@/lib/streak/http'

export const dynamic = 'force-dynamic'

// Public: top players (first names and short wallets only), campuses, and the viewer's own rank.
export async function GET() {
  try { return NextResponse.json(await leaderboard(await currentUser())) }
  catch (err) { return streakFailure(err, 'streak-leaderboard') }
}
